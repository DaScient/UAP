FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/api-gateway .

FROM gcr.io/distroless/base-debian12
COPY --from=builder /bin/api-gateway /api-gateway
EXPOSE 8080
ENTRYPOINT ["/api-gateway"]
