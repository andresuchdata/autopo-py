package stock_health

import (
	"math"
	"strconv"
	"strings"
)

// roundFloat rounds v to the given number of decimal places.
func roundFloat(v float64, decimals int) float64 {
	if decimals <= 0 {
		return math.Round(v)
	}

	factor := math.Pow(10, float64(decimals))
	return math.Round(v*factor) / factor
}

// formatIDFloat formats a float using Indonesian locale conventions:
// thousands separator as dot and decimal separator as comma.
// When the fractional part is zero after rounding, it STILL shows the decimals if decimals > 0.
// Example: 1234.5 (2 decimals) => "1.234,50"; 1000.0 (2 decimals) => "1.000,00".
func formatIDFloat(v float64, decimals int) string {
	neg := v < 0
	if neg {
		v = -v
	}

	if decimals < 0 {
		decimals = 0
	}

	// Round to requested decimal places
	s := strconv.FormatFloat(v, 'f', decimals, 64)
	parts := strings.Split(s, ".")
	intPart := parts[0]
	fracPart := ""
	if len(parts) > 1 {
		fracPart = parts[1]
	}

	// Format integer part with dot as thousands separator
	if len(intPart) > 3 {
		var buf []byte
		count := 0
		for i := len(intPart) - 1; i >= 0; i-- {
			buf = append(buf, intPart[i])
			count++
			if count == 3 && i != 0 {
				buf = append(buf, '.')
				count = 0
			}
		}
		// Reverse buf
		for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
			buf[i], buf[j] = buf[j], buf[i]
		}
		intPart = string(buf)
	}

	res := intPart
	if neg {
		res = "-" + res
	}

	if decimals > 0 {
		res += "," + fracPart
	}

	return res
}
