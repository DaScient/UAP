use wasm_bindgen::prelude::*;

pub mod parallax;

use parallax::{calculate_intersection_geocentric, StationObservation};

#[wasm_bindgen]
pub fn calculate_intersection_geocentric_js(obs1: JsValue, obs2: JsValue) -> Result<JsValue, JsValue> {
    let obs1: StationObservation = serde_wasm_bindgen::from_value(obs1)
        .map_err(|err| JsValue::from_str(&format!("failed to parse first observation: {err}")))?;
    let obs2: StationObservation = serde_wasm_bindgen::from_value(obs2)
        .map_err(|err| JsValue::from_str(&format!("failed to parse second observation: {err}")))?;

    let result = calculate_intersection_geocentric(&obs1, &obs2)
        .map_err(|err| JsValue::from_str(&err))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|err| JsValue::from_str(&format!("failed to serialize result: {err}")))
}
