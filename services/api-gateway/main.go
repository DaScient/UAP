package main

import (
"context"
"encoding/json"
"log"
"net/http"
"os"
"time"

triangulation "github.com/DaScient/UAP/services/api-gateway/triangulation"
)

type noopMathEngine struct{}

func (noopMathEngine) CalculateIntersection(_ context.Context, a triangulation.Observation, b triangulation.Observation) (triangulation.InterceptSolution, error) {
return triangulation.InterceptSolution{X: a.Latitude, Y: b.Longitude, Z: 0, AltitudeMeters: (a.AltitudeM + b.AltitudeM) / 2}, nil
}

type noopNotifier struct{}

func (noopNotifier) Notify(_ context.Context, _ triangulation.CommunityIncidentNode, _ float64) error {
return nil
}

func main() {
port := os.Getenv("PORT")
if port == "" {
port = "8080"
}

router := triangulation.NewRouter(noopMathEngine{}, noopNotifier{})
mux := http.NewServeMux()
mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
w.WriteHeader(http.StatusOK)
_, _ = w.Write([]byte("ok"))
})
mux.HandleFunc("/triangulation/events", func(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodPost {
w.WriteHeader(http.StatusMethodNotAllowed)
return
}
var obs triangulation.Observation
if err := json.NewDecoder(r.Body).Decode(&obs); err != nil {
http.Error(w, err.Error(), http.StatusBadRequest)
return
}
if obs.Timestamp.IsZero() {
obs.Timestamp = time.Now().UTC()
}
incident, err := router.Ingest(r.Context(), obs)
if err != nil {
http.Error(w, err.Error(), http.StatusBadRequest)
return
}
w.Header().Set("Content-Type", "application/json")
_ = json.NewEncoder(w).Encode(incident)
})

log.Printf("api-gateway listening on :%s", port)
log.Fatal(http.ListenAndServe(":"+port, mux))
}
