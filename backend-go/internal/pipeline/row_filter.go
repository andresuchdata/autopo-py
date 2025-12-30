package pipeline

import (
	"fmt"
	"os"
	"strings"
)

type RowFilter struct {
	includeBrands    map[string]struct{}
	excludeBrands    map[string]struct{}
	includeSuppliers map[string]struct{}
	excludeSuppliers map[string]struct{}
	includeSKUs      map[string]struct{}
	excludeSKUs      map[string]struct{}
	includeStores    map[string]struct{}
	excludeStores    map[string]struct{}
}

func NewRowFilter() *RowFilter {
	return &RowFilter{
		includeBrands:    make(map[string]struct{}),
		excludeBrands:    make(map[string]struct{}),
		includeSuppliers: make(map[string]struct{}),
		excludeSuppliers: make(map[string]struct{}),
		includeSKUs:      make(map[string]struct{}),
		excludeSKUs:      make(map[string]struct{}),
		includeStores:    make(map[string]struct{}),
		excludeStores:    make(map[string]struct{}),
	}
}

func NewRowFilterFromEnv() *RowFilter {
	f := &RowFilter{
		includeBrands:    parseSet(os.Getenv("PIPELINE_INCLUDE_BRANDS")),
		excludeBrands:    parseSet(os.Getenv("PIPELINE_EXCLUDE_BRANDS")),
		includeSuppliers: parseSet(os.Getenv("PIPELINE_INCLUDE_SUPPLIERS")),
		excludeSuppliers: parseSet(os.Getenv("PIPELINE_EXCLUDE_SUPPLIERS")),
		includeSKUs:      parseSet(os.Getenv("PIPELINE_INCLUDE_SKUS")),
		excludeSKUs:      parseSet(os.Getenv("PIPELINE_EXCLUDE_SKUS")),
	}

	if len(f.includeBrands)+len(f.excludeBrands)+len(f.includeSuppliers)+len(f.excludeSuppliers)+len(f.includeSKUs)+len(f.excludeSKUs) == 0 {
		return nil
	}
	return f
}

func (f *RowFilter) SetIncludeStores(stores []string) {
	if len(stores) == 0 {
		return
	}
	if f.includeStores == nil {
		f.includeStores = make(map[string]struct{})
	}
	for _, s := range stores {
		n := normalize(s)
		if n != "" {
			f.includeStores[n] = struct{}{}
		}
	}
}

func (f *RowFilter) FilterRows(rows []TransformedRow) (kept []TransformedRow, dropped int) {
	if f == nil {
		return rows, 0
	}

	kept = make([]TransformedRow, 0, len(rows))
	for _, r := range rows {
		if f.allowRow(r) {
			kept = append(kept, r)
		} else {
			dropped++
		}
	}
	return kept, dropped
}

func (f *RowFilter) allowRow(r TransformedRow) bool {
	brand := extractString(r.Data, []string{"brand", "Brand"})
	supplier := extractString(r.Data, []string{"supplier", "Supplier", "supplier_name", "Supplier Name", "Nama Supplier"})
	sku := extractString(r.Data, []string{"sku", "SKU"})

	if !matchesIncludeExclude(brand, f.includeBrands, f.excludeBrands) {
		return false
	}
	if !matchesIncludeExclude(supplier, f.includeSuppliers, f.excludeSuppliers) {
		return false
	}
	if !matchesIncludeExclude(sku, f.includeSKUs, f.excludeSKUs) {
		return false
	}

	store := extractString(r.Data, []string{"store", "Store", "toko", "Toko", "Store Name"})
	if !matchesIncludeExclude(store, f.includeStores, f.excludeStores) {
		return false
	}

	return true
}

func matchesIncludeExclude(value string, include, exclude map[string]struct{}) bool {
	n := normalize(value)

	if len(include) > 0 {
		if n == "" {
			return false
		}
		if _, ok := include[n]; !ok {
			return false
		}
	}

	if len(exclude) > 0 {
		if n != "" {
			if _, ok := exclude[n]; ok {
				return false
			}
		}
	}

	return true
}

func parseSet(s string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, part := range strings.Split(s, ",") {
		n := normalize(part)
		if n == "" {
			continue
		}
		out[n] = struct{}{}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalize(s string) string {
	return strings.ToUpper(strings.TrimSpace(s))
}

func extractString(m map[string]interface{}, keys []string) string {
	if m == nil {
		return ""
	}
	for _, k := range keys {
		v, ok := m[k]
		if !ok || v == nil {
			continue
		}
		s, ok := v.(string)
		if ok {
			return strings.TrimSpace(s)
		}
		return strings.TrimSpace(fmt.Sprint(v))
	}
	return ""
}
