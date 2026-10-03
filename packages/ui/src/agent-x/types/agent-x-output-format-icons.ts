import type { AgentXOutputOption } from '@nxt1/core/ai';

const PDF_ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
    <path d="M14 4h24l12 12v42a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V4Z" fill="#fff"/>
    <path d="M38 4v12h12" fill="#F4F4F5"/>
    <path d="M38 4v12h12" stroke="#D4D4D8" stroke-width="2.25" stroke-linejoin="round"/>
    <path d="M14 4h24l12 12v42a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V4Z" stroke="#D4D4D8" stroke-width="2.25" stroke-linejoin="round"/>
    <rect x="8" y="30" width="48" height="20" rx="10" fill="#DC2626"/>
    <path d="M18 43.5V35h5.196c1.895 0 3.171 1.223 3.171 2.975 0 1.776-1.276 2.987-3.171 2.987h-2.624V43.5H18Zm2.572-4.642h2.191c.746 0 1.182-.44 1.182-.88 0-.44-.436-.88-1.182-.88h-2.191v1.76ZM28.524 43.5V35h3.867c2.6 0 4.47 1.706 4.47 4.25 0 2.557-1.87 4.25-4.47 4.25h-3.867Zm2.571-2.27h1.095c1.229 0 1.944-.857 1.944-1.98 0-1.15-.667-1.98-1.944-1.98h-1.095v3.96ZM39.418 43.5V35h6.011v2.27h-3.44v1.028h3.32v2.27h-3.32V43.5h-2.571Z" fill="#fff"/>
  </svg>`
)}`;

const CSV_ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
    <path d="M14 4h24l12 12v42a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V4Z" fill="#fff"/>
    <path d="M38 4v12h12" fill="#ECFDF5"/>
    <path d="M38 4v12h12" stroke="#A7F3D0" stroke-width="2.25" stroke-linejoin="round"/>
    <path d="M14 4h24l12 12v42a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V4Z" stroke="#A7F3D0" stroke-width="2.25" stroke-linejoin="round"/>
    <rect x="8" y="30" width="48" height="20" rx="10" fill="#059669"/>
    <path d="M24.287 43.848c-2.621 0-4.565-1.834-4.565-4.598 0-2.773 1.944-4.608 4.565-4.608 1.395 0 2.633.514 3.503 1.467l-1.78 1.593c-.44-.494-.995-.796-1.582-.796-1.142 0-1.965.921-1.965 2.344 0 1.425.823 2.345 1.965 2.345.587 0 1.142-.302 1.582-.796l1.78 1.593c-.87.954-2.108 1.456-3.503 1.456ZM33.139 43.848c-2.747 0-4.765-1.889-4.765-4.598 0-2.71 2.018-4.608 4.765-4.608 2.746 0 4.766 1.898 4.766 4.608 0 2.709-2.02 4.598-4.766 4.598Zm0-2.386c1.11 0 1.965-.845 1.965-2.212 0-1.369-.855-2.223-1.965-2.223-1.112 0-1.965.854-1.965 2.223 0 1.367.853 2.212 1.965 2.212ZM39.033 43.649v-8.81h2.81l2.37 3.93 2.369-3.93h2.81v8.81h-2.62v-4.07l-1.975 3.196h-1.174l-1.977-3.196v4.07h-2.613Z" fill="#fff"/>
  </svg>`
)}`;

export const OUTPUT_FORMAT_FAVICONS: Readonly<
  Partial<Record<AgentXOutputOption['formatTag'], string>>
> = {
  PDF: PDF_ICON_DATA_URI,
  GAMMA: 'https://www.google.com/s2/favicons?domain=gamma.app&sz=64',
  XLSX: 'https://www.google.com/s2/favicons?domain=excel.cloud.microsoft&sz=64',
  DOCX: 'https://www.google.com/s2/favicons?domain=word.cloud.microsoft&sz=64',
  PPTX: 'https://www.google.com/s2/favicons?domain=powerpoint.cloud.microsoft&sz=64',
  CSV: CSV_ICON_DATA_URI,
  WEB: 'https://www.google.com/s2/favicons?domain=google.com&sz=64',
};
