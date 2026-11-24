package models

// DocType describes a document type in the checklist.
type DocType struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Required bool   `json:"required"`
}

// DocumentTypes is the ordered checklist of document types.
var DocumentTypes = []DocType{
	{Key: "cv", Label: "Curriculum Vitae (CV)", Required: true},
	{Key: "academic_certificate", Label: "Academic Certificate", Required: true},
	{Key: "professional_certificate", Label: "Professional Certificate", Required: false},
	{Key: "good_conduct", Label: "Certificate of Good Conduct", Required: true},
	{Key: "national_id", Label: "National ID / Passport", Required: true},
	{Key: "kra_pin", Label: "KRA PIN Certificate", Required: true},
	{Key: "passport_photo", Label: "Passport Photo", Required: true},
	{Key: "contract", Label: "Employment Contract", Required: true},
	{Key: "nssf", Label: "NSSF Registration", Required: false},
	{Key: "sha", Label: "SHA Registration", Required: false},
	{Key: "other", Label: "Other", Required: false},
}

// DocTypeByKey finds a document type.
func DocTypeByKey(key string) (DocType, bool) {
	for _, t := range DocumentTypes {
		if t.Key == key {
			return t, true
		}
	}
	return DocType{}, false
}

// RequiredDocKeys lists the keys of required document types.
func RequiredDocKeys() []string {
	out := make([]string, 0, len(DocumentTypes))
	for _, t := range DocumentTypes {
		if t.Required {
			out = append(out, t.Key)
		}
	}
	return out
}

// ChangeRequestFields maps allowed change-request field names to employee columns.
var ChangeRequestFields = map[string]string{
	"bankName":     "bank_name",
	"bankAccount":  "bank_account",
	"nssfNo":       "nssf_no",
	"shaNo":        "sha_no",
	"kraPin":       "kra_pin",
	"nationalIdNo": "national_id_no",
}
