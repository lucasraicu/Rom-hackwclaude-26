import type { CsvPreviewData } from "./documentPreview";

export function CsvPreview({
  data,
  filename,
}: {
  data: CsvPreviewData;
  filename: string;
}) {
  const columnLimit = 12;
  return (
    <div className="csv-preview">
      <p>
        Showing {data.rows.length} of {data.rowCount} data records
        {data.headers.length > columnLimit
          ? ` and the first ${columnLimit} of ${data.headers.length} columns`
          : ""}
        . Preview only; financial records have not been validated or analyzed.
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label={`CSV preview for ${filename}`}
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">
            Parsed CSV preview of {filename}
          </caption>
          <thead>
            <tr>
              {data.headers.slice(0, columnLimit).map((header, index) => (
                <th key={index} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={index}>
                {row.slice(0, columnLimit).map((value, column) => (
                  <td key={column}>
                    {value || <span className="muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
