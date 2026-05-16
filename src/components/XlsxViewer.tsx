'use client';

type Sheet = { name: string; header: string[]; rows: string[][] };

type Props = {
  sheets: Sheet[];
  highlightedTags: Set<string>;
  onTagClick: (tag: string) => void;
};

export function XlsxViewer({ sheets, highlightedTags, onTagClick }: Props) {
  return (
    <div className="p-6 space-y-6">
      {sheets.map((sheet) => (
        <div key={sheet.name} className="bg-white shadow-md border border-zinc-200 rounded">
          <div className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600 uppercase tracking-wide">
            {sheet.name}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/60">
                  {sheet.header.map((h, i) => (
                    <th key={i} className="text-left px-3 py-2 font-medium text-zinc-700 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, i) => {
                  const tag = row[0];
                  const isTagRow = tag && highlightedTags.has(tag);
                  return (
                    <tr
                      key={i}
                      data-tag={tag}
                      onClick={() => tag && onTagClick(tag)}
                      className={`border-b border-zinc-100 last:border-b-0 cursor-pointer transition-colors ${
                        isTagRow ? 'bg-amber-100 ring-2 ring-amber-500 ring-inset' : 'hover:bg-zinc-50'
                      }`}
                    >
                      {row.map((cell, j) => (
                        <td key={j} className={`px-3 py-2 align-top ${j === 0 ? 'font-mono font-semibold' : 'text-zinc-700'}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
