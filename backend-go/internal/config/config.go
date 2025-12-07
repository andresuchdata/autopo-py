// backend-go/internal/config/config.go
package config

import (
	"log"
	"os"
	"sync"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	App      AppConfig
	Cache    CacheConfig
}

type ServerConfig struct {
	Port           string
	Mode           string
	ReadTimeout    int
	WriteTimeout   int
	AllowedOrigins []string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type AppConfig struct {
	UploadDir string
	DataDir   string
}

type CacheConfig struct {
	Enabled             bool
	RedisURL            string
	RedisHost           string
	RedisPort           string
	RedisPassword       string
	RedisDB             int
	DashboardTTLSeconds int
}

var (
	once     sync.Once
	instance *Config
)

func Load() *Config {
	once.Do(func() {
		// Load .env file if it exists
		_ = godotenv.Load()

		// Set default values
		viper.SetDefault("SERVER_PORT", "8080")
		viper.SetDefault("SERVER_MODE", "debug")
		viper.SetDefault("DB_HOST", "localhost")
		viper.SetDefault("DB_PORT", "5432")
		viper.SetDefault("DB_USER", "postgres")
		viper.SetDefault("DB_PASSWORD", "postgres")
		viper.SetDefault("DB_NAME", "autopo")
		viper.SetDefault("DB_SSLMODE", "disable")
		viper.SetDefault("SERVER_ALLOWED_ORIGINS", []string{"*"})
		viper.SetDefault("APP_UPLOAD_DIR", "./data/uploads")
		viper.SetDefault("APP_DATA_DIR", "./data/output")
		viper.SetDefault("CACHE_ENABLED", false)
		viper.SetDefault("REDIS_URL", "")
		viper.SetDefault("REDIS_HOST", "127.0.0.1")
		viper.SetDefault("REDIS_PORT", "6379")
		viper.SetDefault("REDIS_PASSWORD", "")
		viper.SetDefault("REDIS_DB", 0)
		viper.SetDefault("CACHE_DASHBOARD_TTL_SECONDS", 60)

		// Read from environment variables
		viper.AutomaticEnv()

		// Ensure upload and data directories exist
		ensureDir(viper.GetString("APP_UPLOAD_DIR"))
		ensureDir(viper.GetString("APP_DATA_DIR"))

		instance = &Config{
			Server: ServerConfig{
				Port:           viper.GetString("SERVER_PORT"),
				Mode:           viper.GetString("SERVER_MODE"),
				ReadTimeout:    viper.GetInt("SERVER_READ_TIMEOUT"),
				WriteTimeout:   viper.GetInt("SERVER_WRITE_TIMEOUT"),
				AllowedOrigins: viper.GetStringSlice("SERVER_ALLOWED_ORIGINS"),
			},
			Database: DatabaseConfig{
				Host:     viper.GetString("DB_HOST"),
				Port:     viper.GetString("DB_PORT"),
				User:     viper.GetString("DB_USER"),
				Password: viper.GetString("DB_PASSWORD"),
				DBName:   viper.GetString("DB_NAME"),
				SSLMode:  viper.GetString("DB_SSLMODE"),
			},
			App: AppConfig{
				UploadDir: viper.GetString("APP_UPLOAD_DIR"),
				DataDir:   viper.GetString("APP_DATA_DIR"),
			},
			Cache: CacheConfig{
				Enabled:             viper.GetBool("CACHE_ENABLED"),
				RedisURL:            viper.GetString("REDIS_URL"),
				RedisHost:           viper.GetString("REDIS_HOST"),
				RedisPort:           viper.GetString("REDIS_PORT"),
				RedisPassword:       viper.GetString("REDIS_PASSWORD"),
				RedisDB:             viper.GetInt("REDIS_DB"),
				DashboardTTLSeconds: viper.GetInt("CACHE_DASHBOARD_TTL_SECONDS"),
			},
		}
	})

	return instance
}

func ensureDir(dir string) {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Fatalf("Failed to create directory %s: %v", dir, err)
		}
	}
}
