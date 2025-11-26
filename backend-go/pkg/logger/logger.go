// backend-go/pkg/logger/logger.go
package logger

import (
	"os"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/pkgerrors"
)

var (
	// Log is the global logger instance
	Log zerolog.Logger
)

func init() {
	zerolog.ErrorStackMarshaler = pkgerrors.MarshalStack
	zerolog.TimeFieldFormat = time.RFC3339Nano

	// Default to console output with color
	output := zerolog.ConsoleWriter{
		Out:        os.Stdout,
		TimeFormat: "2006-01-02 15:04:05",
	}

	Log = zerolog.New(output).
		Level(zerolog.InfoLevel).
		With().
		Timestamp().
		Caller().
		Logger()
}

// SetLevel sets the log level
func SetLevel(levelStr string) {
	level, err := zerolog.ParseLevel(levelStr)
	if err != nil {
		Log.Warn().Str("level", levelStr).Msg("invalid log level, defaulting to info")
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)
	Log = Log.Level(level)
}