//! Geocentric parallax and line-intersection utilities.
//!
//! The functions in this module operate on a WGS-84 ellipsoid and convert local
//! azimuth/elevation observations into Earth-Centered, Earth-Fixed coordinates.
//! This avoids the large errors that arise when a flat-Earth tangent-plane model
//! is stretched across long baselines.

use serde::{Deserialize, Serialize};

const WGS84_A: f64 = 6_378_137.0;
const WGS84_F: f64 = 1.0 / 298.257_223_563;
const MIN_ANGULAR_SEPARATION_RAD: f64 = 0.001;

/// A single station's view of a target from its local tangent plane.
///
/// Latitude and longitude are expressed in radians, altitude is measured in
/// meters above the WGS-84 ellipsoid, and azimuth/elevation are also expressed
/// in radians.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StationObservation {
    pub station_id: String,
    pub lat_rad: f64,
    pub lon_rad: f64,
    pub alt_m: f64,
    pub azimuth_rad: f64,
    pub elevation_rad: f64,
}

/// Converts a geodetic latitude, longitude, and ellipsoidal altitude into ECEF
/// coordinates using the WGS-84 ellipsoid.
///
/// For geodetic latitude `φ`, longitude `λ`, and altitude `h`, the prime
/// vertical radius of curvature is:
///
/// `N = a / sqrt(1 - e² sin²φ)`
///
/// where `a` is the semi-major axis and `e² = f(2-f)` is the first
/// eccentricity squared. The resulting ECEF coordinates are:
///
/// `x = (N + h) cosφ cosλ`
/// `y = (N + h) cosφ sinλ`
/// `z = (N(1 - e²) + h) sinφ`
fn geodetic_to_ecef(lat_rad: f64, lon_rad: f64, alt_m: f64) -> (f64, f64, f64) {
    let e2 = WGS84_F * (2.0 - WGS84_F);
    let sin_lat = lat_rad.sin();
    let cos_lat = lat_rad.cos();
    let sin_lon = lon_rad.sin();
    let cos_lon = lon_rad.cos();
    let n = WGS84_A / (1.0 - e2 * sin_lat * sin_lat).sqrt();

    let x = (n + alt_m) * cos_lat * cos_lon;
    let y = (n + alt_m) * cos_lat * sin_lon;
    let z = (n * (1.0 - e2) + alt_m) * sin_lat;
    (x, y, z)
}

/// Converts a local ENU line-of-sight vector into an ECEF unit vector.
///
/// The input azimuth is measured clockwise from true north and elevation is
/// measured upward from the local horizon. The local ENU vector is first built
/// as:
///
/// `east  = sin(az) cos(el)`
/// `north = cos(az) cos(el)`
/// `up    = sin(el)`
///
/// The ENU basis is then rotated into ECEF using the station's geodetic
/// latitude and longitude.
fn los_enu_to_ecef(lat_rad: f64, lon_rad: f64, azimuth_rad: f64, elevation_rad: f64) -> (f64, f64, f64) {
    let east = azimuth_rad.sin() * elevation_rad.cos();
    let north = azimuth_rad.cos() * elevation_rad.cos();
    let up = elevation_rad.sin();

    let sin_lat = lat_rad.sin();
    let cos_lat = lat_rad.cos();
    let sin_lon = lon_rad.sin();
    let cos_lon = lon_rad.cos();

    let x = -sin_lon * east - sin_lat * cos_lon * north + cos_lat * cos_lon * up;
    let y = cos_lon * east - sin_lat * sin_lon * north + cos_lat * sin_lon * up;
    let z = cos_lat * north + sin_lat * up;

    normalize((x, y, z))
}

fn normalize(v: (f64, f64, f64)) -> (f64, f64, f64) {
    let norm = (v.0 * v.0 + v.1 * v.1 + v.2 * v.2).sqrt();
    (v.0 / norm, v.1 / norm, v.2 / norm)
}

fn dot(a: (f64, f64, f64), b: (f64, f64, f64)) -> f64 {
    a.0 * b.0 + a.1 * b.1 + a.2 * b.2
}

fn sub(a: (f64, f64, f64), b: (f64, f64, f64)) -> (f64, f64, f64) {
    (a.0 - b.0, a.1 - b.1, a.2 - b.2)
}

fn add(a: (f64, f64, f64), b: (f64, f64, f64)) -> (f64, f64, f64) {
    (a.0 + b.0, a.1 + b.1, a.2 + b.2)
}

fn scale(a: (f64, f64, f64), scalar: f64) -> (f64, f64, f64) {
    (a.0 * scalar, a.1 * scalar, a.2 * scalar)
}

/// Computes the closest-point midpoint between two observation rays in ECEF.
///
/// Each station defines a line `p + t d` where `p` is the station position in
/// ECEF and `d` is the unit line-of-sight vector in ECEF. The least-squares
/// solution for two skew lines is obtained by solving for the pair of parameters
/// `(t, s)` that minimises the distance between the two lines. The midpoint of
/// the resulting closest points is returned as the best-fit intercept estimate.
///
/// The function rejects near-parallel rays because their least-squares solution
/// becomes ill-conditioned and physically uninformative.
pub fn calculate_intersection_geocentric(
    obs1: &StationObservation,
    obs2: &StationObservation,
) -> Result<(f64, f64, f64), String> {
    let p1 = geodetic_to_ecef(obs1.lat_rad, obs1.lon_rad, obs1.alt_m);
    let p2 = geodetic_to_ecef(obs2.lat_rad, obs2.lon_rad, obs2.alt_m);
    let d1 = los_enu_to_ecef(obs1.lat_rad, obs1.lon_rad, obs1.azimuth_rad, obs1.elevation_rad);
    let d2 = los_enu_to_ecef(obs2.lat_rad, obs2.lon_rad, obs2.azimuth_rad, obs2.elevation_rad);

    let alignment = dot(d1, d2).clamp(-1.0, 1.0);
    let angular_separation = alignment.acos();
    if angular_separation < MIN_ANGULAR_SEPARATION_RAD
        || (std::f64::consts::PI - angular_separation) < MIN_ANGULAR_SEPARATION_RAD
    {
        return Err("station observation rays are near-parallel".to_string());
    }

    let w0 = sub(p1, p2);
    let a = dot(d1, d1);
    let b = dot(d1, d2);
    let c = dot(d2, d2);
    let d = dot(d1, w0);
    let e = dot(d2, w0);
    let denom = a * c - b * b;

    if denom.abs() < 1e-9 {
        return Err("station observation rays are numerically unstable".to_string());
    }

    let t = (b * e - c * d) / denom;
    let s = (a * e - b * d) / denom;

    let closest_1 = add(p1, scale(d1, t));
    let closest_2 = add(p2, scale(d2, s));
    let midpoint = scale(add(closest_1, closest_2), 0.5);

    Ok(midpoint)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parallel_rays() {
        let a = StationObservation {
            station_id: "a".into(),
            lat_rad: 0.5,
            lon_rad: 0.5,
            alt_m: 0.0,
            azimuth_rad: 1.0,
            elevation_rad: 0.5,
        };
        let b = StationObservation {
            station_id: "b".into(),
            ..a.clone()
        };
        assert!(calculate_intersection_geocentric(&a, &b).is_err());
    }
}
