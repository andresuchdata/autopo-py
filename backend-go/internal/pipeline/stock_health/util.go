package stock_health

import (
	"fmt"
	"math"
	"strconv"
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
// When the fractional part is zero after rounding, the decimal part is omitted.
// Example: 1234.5 (2 decimals) => "1.234,50"; 1000.0 => "1.000".
func formatIDFloat(v float64, decimals int) string {
	neg := v < 0
	if neg {
		v = -v
	}

	if decimals < 0 {
		decimals = 0
	}

	// round to requested decimal places
	factor := math.Pow(10, float64(decimals))
	scaled := math.Round(v * factor)
	intPart := int64(scaled) / int64(factor)
	fracPart := int64(scaled) % int64(factor)

	// format integer part with dot as thousands separator
	s := strconv.FormatInt(intPart, 10)
	if len(s) > 3 {
		var buf []byte
		count := 0
		for i := len(s) - 1; i >= 0; i-- {
			buf = append(buf, s[i])
			count++
			if count == 3 && i != 0 {
				buf = append(buf, '.')
				count = 0
			}
		}
		// reverse buf
		for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
			buf[i], buf[j] = buf[j], buf[i]
		}
		s = string(buf)
	}

	prefix := ""
	if neg {
		prefix = "-"
	}

	// If there is no fractional part after rounding, omit decimals entirely
	if decimals == 0 || fracPart == 0 {
		return prefix + s
	}

	// Left-pad fractional part with zeros up to the requested precision
	fracStr := strconv.FormatInt(fracPart, 10)
	for len(fracStr) < decimals {
		fracStr = "0" + fracStr
	}

	return fmt.Sprintf("%s%s,%s", prefix, s, fracStr)
}
