package domain

import "strings"

var poStatusLabels = map[int]string{
	0: "Released",
	1: "Approved",
	2: "Declined",
	3: "Received",
	4: "Sent",
	5: "Arrived",
}

var poStatusCodes = map[string]int{
	"released": 0,
	"approved": 1,
	"declined": 2,
	"received": 3,
	"sent":     4,
	"arrived":  5,
}

// POStatusLabel returns a human-readable label for a PO status code.
func POStatusLabel(status int) string {
	if label, ok := poStatusLabels[status]; ok {
		return label
	}

	return "Draft"
}

// ParsePOStatus returns the status code for a given label (case-insensitive).
func ParsePOStatus(label string) (int, bool) {
	code, ok := poStatusCodes[strings.ToLower(label)]

	return code, ok
}
