package po_snapshot

import (
	"fmt"
	"strings"
)

// normalizeSKU ensures SKU values are always populated, falling back to the product name.
func normalizeSKU(rawSKU, productName string) string {
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
