package stock_health

import (
	"fmt"
	"strings"
)

// NormalizeSKU ensures SKU values are never empty by falling back to the product name.
// This allows downstream pipeline stages to keep the same row counts even when the raw
// data omits SKU information.
func NormalizeSKU(rawSKU, productName string) string {
	sku := strings.TrimSpace(rawSKU)
	if sku != "" {
		return sku
	}

	name := strings.TrimSpace(productName)
	if name == "" {
		name = "UNKNOWN PRODUCT"
	}

	return fmt.Sprintf("N/A - %s", name)
}
