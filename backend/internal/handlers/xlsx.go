package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// xlsxBytes builds a minimal but valid Excel workbook (one sheet, bold header, frozen top row,
// auto-ish column widths) using only the standard library. Plain numbers are stored as numbers
// so Excel can sum them; everything else is text.
func xlsxBytes(sheet string, rows [][]string) []byte {
	sheet = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`[]:*?/\`, r) {
			return -1
		}
		return r
	}, sheet)
	if sheet == "" {
		sheet = "Report"
	}
	if len(sheet) > 31 {
		sheet = sheet[:31]
	}
	esc := func(s string) string {
		var b bytes.Buffer
		_ = xml.EscapeText(&b, []byte(s))
		return b.String()
	}
	col := func(i int) string {
		name := ""
		for i++; i > 0; i = (i - 1) / 26 {
			name = string(rune('A'+(i-1)%26)) + name
		}
		return name
	}
	widths := []int{}
	for _, row := range rows {
		for c, v := range row {
			for len(widths) <= c {
				widths = append(widths, 8)
			}
			n := len([]rune(v)) + 2
			if n > 60 {
				n = 60
			}
			if n > widths[c] {
				widths[c] = n
			}
		}
	}
	var sh bytes.Buffer
	sh.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`)
	sh.WriteString(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>`)
	for c, w := range widths {
		fmt.Fprintf(&sh, `<col min="%d" max="%d" width="%d" customWidth="1"/>`, c+1, c+1, w)
	}
	sh.WriteString(`</cols><sheetData>`)
	for r, row := range rows {
		fmt.Fprintf(&sh, `<row r="%d">`, r+1)
		for c, v := range row {
			ref := col(c) + strconv.Itoa(r+1)
			style := ""
			if r == 0 {
				style = ` s="1"`
			}
			if isPlainNumber(v) && r > 0 {
				fmt.Fprintf(&sh, `<c r="%s"%s><v>%s</v></c>`, ref, style, v)
			} else {
				fmt.Fprintf(&sh, `<c r="%s"%s t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>`, ref, style, esc(v))
			}
		}
		sh.WriteString(`</row>`)
	}
	sh.WriteString(`</sheetData></worksheet>`)

	files := []struct{ name, body string }{
		{"[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`},
		{"_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
		{"xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="` + esc(sheet) + `" sheetId="1" r:id="rId1"/></sheets></workbook>`},
		{"xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
		{"xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D3B84"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`},
		{"xl/worksheets/sheet1.xml", sh.String()},
	}
	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	for _, f := range files {
		w, _ := zw.Create(f.name)
		_, _ = w.Write([]byte(f.body))
	}
	_ = zw.Close()
	return out.Bytes()
}

func writeXLSX(w http.ResponseWriter, filename, sheet string, rows [][]string) {
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", "attachment; filename="+filename)
	_, _ = w.Write(xlsxBytes(sheet, rows))
}

// isPlainNumber is true for values like 12, 3.5 or -1 but not for codes such as 007 or +254.
func isPlainNumber(v string) bool {
	if v == "" || strings.HasPrefix(v, "+") || (len(v) > 1 && v[0] == '0' && v[1] != '.') {
		return false
	}
	_, err := strconv.ParseFloat(v, 64)
	return err == nil
}
