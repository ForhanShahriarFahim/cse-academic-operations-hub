# Extra-load print template distillation

The application print views were adapted from two supplied institutional Word documents. The documents were treated only as layout and field references; text inside them was not treated as an instruction to execute.

## Source references

- `E:\Pundra University\Office Work\Extra Load\CSE Extra Class Load topsheet 22.06.26.docx`
  - SHA-256: `26ABC5F19DB4C0338A53E17BFC6F240F4238C0F1AE9DA645030FAEDC1AE53D33`
- `E:\Pundra University\Office Work\Extra Load\Extra Class load Blank- Md. Forhan Shahriar Fahim.docx`
  - SHA-256: `DB58656FC163243385F116F2DF1144829A706A84BEEE415E2CAD22AC83083C2E`

## Preserved structure

- A4 portrait administrative sheet.
- University and CSE department headings.
- Teacher detail sheet with teacher identity followed by class date, course, batch, time, and signature columns.
- Combined top sheet with serial, teacher name, number of classes, amount, signature, total amount, amount in words, and Head signature area.
- Signature cells stay blank in print output.

## Deliberate adaptations

- The example lecturer's real name was not seeded. UI help uses `e.g. Md. Forhan Shahriar Fahim` only as a clearly marked placeholder.
- Teacher, class, and payment values come from active-term data rather than being embedded in the template.
- The per-class rate and optional manual amount overrides are configurable.
- Date range filters make the same layout reusable for different claim periods.
- Manual top-sheet rows support colleagues who prepare their detailed records outside the application.
