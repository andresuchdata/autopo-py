package telemetry

import (
	"context"
	"net/http"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/mux"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
)

var tracer trace.Tracer

func InitTracer(ctx context.Context, cfg *config.OTelConfig) (*sdktrace.TracerProvider, error) {
	endpoint := cfg.Endpoint
	if endpoint == "" {
		endpoint = "localhost:4317"
	}

	exporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(endpoint),
		otlptracegrpc.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	resource := resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(cfg.ServiceName),
		semconv.ServiceVersion(cfg.ServiceVersion),
		attribute.String("deployment.environment", cfg.Environment),
	)

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(resource),
	)

	otel.SetTracerProvider(tp)
	tracer = tp.Tracer(cfg.ServiceName)

	return tp, nil
}

func Tracer() trace.Tracer {
	return tracer
}

func ShutdownTracer(tp *sdktrace.TracerProvider, ctx context.Context) error {
	if tp == nil {
		return nil
	}
	return tp.Shutdown(ctx)
}

func WrapMuxWithTracing(router *mux.Router, serviceName string) http.Handler {
	return otelhttp.NewHandler(router, serviceName)
}

func UseGinTracing(router *gin.Engine, serviceName string, opts ...otelgin.Option) {
	if router == nil {
		return
	}
	if serviceName == "" {
		serviceName = "gin-server"
	}
	router.Use(otelgin.Middleware(serviceName, opts...))
}
