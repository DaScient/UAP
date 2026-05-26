package triangulation

import (
"context"
"testing"
"time"
)

type stubMathEngine struct{}

func (stubMathEngine) CalculateIntersection(_ context.Context, _ Observation, _ Observation) (InterceptSolution, error) {
return InterceptSolution{X: 1, Y: 2, Z: 3, AltitudeMeters: 1000}, nil
}

type stubNotifier struct{ count int }

func (s *stubNotifier) Notify(_ context.Context, _ CommunityIncidentNode, _ float64) error {
s.count++
return nil
}

func TestRouterClustersAndTriggersIntersection(t *testing.T) {
notifier := &stubNotifier{}
router := NewRouter(stubMathEngine{}, notifier)
now := time.Now().UTC()

_, err := router.Ingest(context.Background(), Observation{
EventID: "1", WitnessID: "a", Latitude: 40.0, Longitude: -74.0, Timestamp: now,
})
if err != nil {
t.Fatalf("unexpected error: %v", err)
}

incident, err := router.Ingest(context.Background(), Observation{
EventID: "2", WitnessID: "b", Latitude: 40.1, Longitude: -74.0, Timestamp: now.Add(5 * time.Minute),
})
if err != nil {
t.Fatalf("unexpected error: %v", err)
}
if incident.UniqueViewCount != 2 {
t.Fatalf("expected 2 unique views, got %d", incident.UniqueViewCount)
}
if incident.Intercept == nil {
t.Fatal("expected intercept to be calculated")
}
if notifier.count != 2 {
t.Fatalf("expected notifier to fire twice, got %d", notifier.count)
}
}
