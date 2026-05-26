package triangulation

import (
"context"
"errors"
"fmt"
"math"
"sync"
"time"
)

const (
defaultRadiusMeters = 50_000.0
defaultTimeWindow   = 10 * time.Minute
earthRadiusMeters   = 6_371_000.0
)

type Observation struct {
EventID      string         `json:"event_id"`
WitnessID    string         `json:"witness_id"`
Latitude     float64        `json:"latitude"`
Longitude    float64        `json:"longitude"`
AltitudeM    float64        `json:"altitude_meters"`
Timestamp    time.Time      `json:"timestamp"`
AzimuthRad   float64        `json:"azimuth_rad"`
ElevationRad float64        `json:"elevation_rad"`
Metadata     map[string]any `json:"metadata,omitempty"`
}

type InterceptSolution struct {
X              float64   `json:"x"`
Y              float64   `json:"y"`
Z              float64   `json:"z"`
AltitudeMeters float64   `json:"altitude_meters"`
FlightVector   []float64 `json:"flight_vector,omitempty"`
}

type CommunityIncidentNode struct {
ID              string              `json:"id"`
Observations    []Observation       `json:"observations"`
CentroidLat     float64             `json:"centroid_lat"`
CentroidLon     float64             `json:"centroid_lon"`
WindowStart     time.Time           `json:"window_start"`
WindowEnd       time.Time           `json:"window_end"`
UniqueViewCount int                 `json:"unique_view_count"`
Intercept       *InterceptSolution  `json:"intercept,omitempty"`
}

type MathEngine interface {
CalculateIntersection(ctx context.Context, a Observation, b Observation) (InterceptSolution, error)
}

type MeshNotifier interface {
Notify(ctx context.Context, incident CommunityIncidentNode, radiusMeters float64) error
}

type Router struct {
mu                 sync.Mutex
incidents          []*CommunityIncidentNode
mathEngine         MathEngine
notifier           MeshNotifier
clusteringRadius   float64
clusteringWindow   time.Duration
NotifyRadiusMeters float64
}

func NewRouter(mathEngine MathEngine, notifier MeshNotifier) *Router {
return &Router{
mathEngine:         mathEngine,
notifier:           notifier,
clusteringRadius:   defaultRadiusMeters,
clusteringWindow:   defaultTimeWindow,
NotifyRadiusMeters: defaultRadiusMeters,
}
}

func (r *Router) Ingest(ctx context.Context, obs Observation) (*CommunityIncidentNode, error) {
if obs.WitnessID == "" {
return nil, errors.New("witness_id is required")
}
if obs.Timestamp.IsZero() {
return nil, errors.New("timestamp is required")
}

r.mu.Lock()
defer r.mu.Unlock()

incident := r.matchIncident(obs)
if incident == nil {
incident = &CommunityIncidentNode{
ID:           fmt.Sprintf("cin-%d", len(r.incidents)+1),
Observations: []Observation{obs},
CentroidLat:  obs.Latitude,
CentroidLon:  obs.Longitude,
WindowStart:  obs.Timestamp,
WindowEnd:    obs.Timestamp,
}
r.incidents = append(r.incidents, incident)
} else {
incident.Observations = append(incident.Observations, obs)
incident.CentroidLat, incident.CentroidLon = centroid(incident.Observations)
if obs.Timestamp.Before(incident.WindowStart) {
incident.WindowStart = obs.Timestamp
}
if obs.Timestamp.After(incident.WindowEnd) {
incident.WindowEnd = obs.Timestamp
}
}

incident.UniqueViewCount = countUniqueWitnesses(incident.Observations)
if incident.UniqueViewCount >= 2 && incident.Intercept == nil && r.mathEngine != nil {
first, second, ok := firstTwoUniqueObservations(incident.Observations)
if ok {
intercept, err := r.mathEngine.CalculateIntersection(ctx, first, second)
if err == nil {
incident.Intercept = &intercept
}
}
}

if r.notifier != nil {
_ = r.notifier.Notify(ctx, *incident, r.NotifyRadiusMeters)
}

return incident, nil
}

func (r *Router) matchIncident(obs Observation) *CommunityIncidentNode {
for _, incident := range r.incidents {
if absDuration(obs.Timestamp.Sub(incident.WindowEnd)) > r.clusteringWindow && absDuration(obs.Timestamp.Sub(incident.WindowStart)) > r.clusteringWindow {
continue
}
distance := haversineMeters(obs.Latitude, obs.Longitude, incident.CentroidLat, incident.CentroidLon)
if distance <= r.clusteringRadius {
return incident
}
}
return nil
}

func centroid(observations []Observation) (float64, float64) {
var lat, lon float64
for _, obs := range observations {
lat += obs.Latitude
lon += obs.Longitude
}
count := float64(len(observations))
return lat / count, lon / count
}

func countUniqueWitnesses(observations []Observation) int {
seen := map[string]struct{}{}
for _, obs := range observations {
seen[obs.WitnessID] = struct{}{}
}
return len(seen)
}

func firstTwoUniqueObservations(observations []Observation) (Observation, Observation, bool) {
if len(observations) < 2 {
return Observation{}, Observation{}, false
}
first := observations[0]
for _, candidate := range observations[1:] {
if candidate.WitnessID != first.WitnessID {
return first, candidate, true
}
}
return Observation{}, Observation{}, false
}

func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
dLat := degreesToRadians(lat2 - lat1)
dLon := degreesToRadians(lon2 - lon1)
lat1 = degreesToRadians(lat1)
lat2 = degreesToRadians(lat2)
a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1)*math.Cos(lat2)*math.Sin(dLon/2)*math.Sin(dLon/2)
c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
return earthRadiusMeters * c
}

func degreesToRadians(value float64) float64 {
return value * math.Pi / 180.0
}

func absDuration(value time.Duration) time.Duration {
if value < 0 {
return -value
}
return value
}
