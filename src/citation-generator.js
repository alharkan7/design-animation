const DEFAULT_CSV_PATH = '/bibliography/lembar_koding_bibliometrika.csv';

class CitationGeneratorApp {
  constructor() {
    this.references = [];
    this.currentStyle = 'apa';
    this.currentSource = 'default dataset';
    this.citationCache = [];

    this.bindElements();
    this.bindEvents();
    this.loadDefaultDataset();
  }

  bindElements() {
    this.styleSelect = document.getElementById('citationStyle');
    this.csvFileInput = document.getElementById('csvFileInput');
    this.entriesRoot = document.getElementById('bibliographyEntries');
    this.recordCount = document.getElementById('recordCount');
    this.sourceLabel = document.getElementById('sourceLabel');
    this.statusMessage = document.getElementById('statusMessage');
    this.downloadTextBtn = document.getElementById('downloadTextBtn');
    this.downloadBibtexBtn = document.getElementById('downloadBibtexBtn');
  }

  bindEvents() {
    this.styleSelect.addEventListener('change', () => {
      this.currentStyle = this.styleSelect.value;
      this.render();
    });

    this.csvFileInput.addEventListener('change', async (event) => {
      const [file] = event.target.files || [];
      if (!file) return;

      try {
        const csvText = await file.text();
        this.loadRecordsFromCsv(csvText, file.name);
        this.showStatus(`Loaded ${this.references.length} references from ${file.name}.`);
      } catch {
        this.showStatus('Failed to read the selected CSV file.');
      } finally {
        this.csvFileInput.value = '';
      }
    });

    this.downloadTextBtn.addEventListener('click', () => this.downloadBibliographyText());
    this.downloadBibtexBtn.addEventListener('click', () => this.downloadBibtex());
  }

  async loadDefaultDataset() {
    try {
      const response = await fetch(DEFAULT_CSV_PATH);
      if (!response.ok) throw new Error('Failed to fetch default CSV dataset.');
      const csvText = await response.text();
      this.loadRecordsFromCsv(csvText, 'default dataset');
      this.showStatus(`Loaded ${this.references.length} references from default dataset.`);
    } catch {
      this.showStatus('Could not load the default CSV dataset.');
    }
  }

  loadRecordsFromCsv(csvText, sourceName) {
    const rows = this.parseCsv(csvText);
    this.references = rows
      .map((row, index) => this.normalizeRecord(row, index))
      .filter((row) => row.title);

    this.currentSource = sourceName;
    this.sourceLabel.textContent = sourceName;
    this.recordCount.textContent = String(this.references.length);
    this.render();
  }

  parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(cell);
        cell = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i += 1;
        row.push(cell);
        if (row.some((value) => value.trim() !== '')) {
          rows.push(row);
        }
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
    }

    if (rows.length === 0) return [];

    const headers = rows[0].map((header) => this.cleanBom(header).trim());
    return rows.slice(1).map((fields) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = (fields[index] || '').trim();
      });
      return record;
    });
  }

  cleanBom(value) {
    return value.replace(/^\uFEFF/, '');
  }

  normalizeRecord(row, inputOrder) {
    const year = Number.parseInt(row.Tahun_Terbit, 10);
    const authors = this.parseAuthors(row.Penulis || '');

    return {
      inputOrder,
      id: row.Kode_Dokumen || '',
      title: (row.Judul || '').replace(/\s+/g, ' ').trim(),
      authorsRaw: row.Penulis || '',
      authors,
      journal: (row.Nama_Jurnal_Prosiding || '').replace(/\s+/g, ' ').trim(),
      volumePages: (row.Volume_Halaman || '').replace(/\s+/g, ' ').trim(),
      year: Number.isNaN(year) ? null : year,
      doi: (row.DOI || '').trim(),
    };
  }

  render() {
    this.entriesRoot.innerHTML = '';
    const sortedReferences = this.getSortedReferences(this.currentStyle);

    this.citationCache = sortedReferences.map((record, index) => ({
      text: this.formatCitation(record, this.currentStyle, index + 1),
      html: this.formatCitationHtml(record, this.currentStyle, index + 1),
    }));

    this.entriesRoot.style.listStyleType = 'none';
    this.entriesRoot.style.paddingLeft = '0';

    this.citationCache.forEach((citation) => {
      const item = document.createElement('li');
      item.className = `entry${this.currentStyle === 'vancouver' ? ' vancouver' : ''}`;
      item.innerHTML = citation.html;

      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'copy-btn';
      copyButton.textContent = 'Copy';
      copyButton.addEventListener('click', (event) => {
        event.stopPropagation();
        this.copyText(citation.text, copyButton);
      });

      item.appendChild(copyButton);
      this.entriesRoot.appendChild(item);
    });
  }

  getSortedReferences(style) {
    const refs = [...this.references];

    if (style === 'vancouver' || style === 'ieee') {
      return refs.sort((a, b) => a.inputOrder - b.inputOrder);
    }

    return refs.sort((a, b) => this.compareAlphabeticalReferences(a, b));
  }

  compareAlphabeticalReferences(a, b) {
    const authorA = this.primaryAuthorSortKey(a);
    const authorB = this.primaryAuthorSortKey(b);
    const authorCompare = authorA.localeCompare(authorB, undefined, { sensitivity: 'base' });
    if (authorCompare !== 0) return authorCompare;

    const allAuthorsA = this.authorSequenceSortKey(a);
    const allAuthorsB = this.authorSequenceSortKey(b);
    const authorSequenceCompare = allAuthorsA.localeCompare(allAuthorsB, undefined, { sensitivity: 'base' });
    if (authorSequenceCompare !== 0) return authorSequenceCompare;

    const yearA = a.year ?? Number.POSITIVE_INFINITY;
    const yearB = b.year ?? Number.POSITIVE_INFINITY;
    if (yearA !== yearB) return yearA - yearB;

    return (a.title || '').localeCompare((b.title || ''), undefined, { sensitivity: 'base' });
  }

  primaryAuthorSortKey(record) {
    const firstAuthor = record.authors[0] || { family: 'zzzz', given: '' };
    return `${firstAuthor.family} ${firstAuthor.given}`.trim().toLowerCase();
  }

  authorSequenceSortKey(record) {
    return record.authors
      .map((author) => `${author.family} ${author.given}`.trim().toLowerCase())
      .join('|');
  }

  async copyText(text, buttonElement) {
    try {
      await navigator.clipboard.writeText(text);
      this.markCopied(buttonElement);
    } catch {
      const fallbackInput = document.createElement('textarea');
      fallbackInput.value = text;
      fallbackInput.style.position = 'absolute';
      fallbackInput.style.left = '-9999px';
      document.body.appendChild(fallbackInput);
      fallbackInput.select();
      document.execCommand('copy');
      fallbackInput.remove();
      this.markCopied(buttonElement);
    }
  }

  markCopied(buttonElement) {
    const original = buttonElement.textContent;
    buttonElement.textContent = 'Copied';
    buttonElement.classList.add('copied');
    setTimeout(() => {
      buttonElement.textContent = original;
      buttonElement.classList.remove('copied');
    }, 900);
  }

  formatCitation(record, style, number) {
    if (style === 'apa') return this.formatApa(record, false);
    if (style === 'chicago') return this.formatChicago(record, false);
    if (style === 'mla') return this.formatMla(record, false);
    if (style === 'vancouver') return this.formatVancouver(record, number, false);
    return this.formatIeee(record, number, false);
  }

  formatCitationHtml(record, style, number) {
    if (style === 'apa') return this.formatApa(record, true);
    if (style === 'chicago') return this.formatChicago(record, true);
    if (style === 'mla') return this.formatMla(record, true);
    if (style === 'vancouver') return this.formatVancouver(record, number, true);
    return this.formatIeee(record, number, true);
  }

  formatApa(record, html) {
    const year = record.year || 'n.d.';
    const title = this.ensureTerminalPunctuation(record.title || '[Untitled]');
    const doi = this.normalizeDoi(record.doi);
    const source = this.buildJournalSegment(record, 'apa', html);

    return this.joinParts([
      `${this.renderValue(this.formatAuthorsApa(record.authors), html)} (${this.renderValue(String(year), html)}).`,
      this.renderValue(title, html),
      source,
      doi ? `${this.renderValue(doi, html)}.` : '',
    ]);
  }

  formatChicago(record, html) {
    const year = record.year || 'n.d.';
    const title = this.stripTerminalPeriod(record.title || '[Untitled]');
    const doi = this.normalizeDoi(record.doi);
    const source = this.buildJournalSegment(record, 'chicago', html);

    return this.joinParts([
      `${this.renderValue(this.formatAuthorsChicago(record.authors), html)}.`,
      `${this.renderValue(String(year), html)}.`,
      `"${this.renderValue(title, html)}."`,
      source,
      doi ? `${this.renderValue(doi, html)}.` : '',
    ]);
  }

  formatMla(record, html) {
    const year = record.year || 'n.d.';
    const title = this.stripTerminalPeriod(record.title || '[Untitled]');
    const doi = this.normalizeDoi(record.doi);
    const source = this.buildJournalSegment(record, 'mla', html);

    return this.joinParts([
      `${this.renderValue(this.formatAuthorsMla(record.authors), html)}.`,
      `"${this.renderValue(title, html)}."`,
      source,
      `${this.renderValue(String(year), html)}.`,
      doi ? `${this.renderValue(doi, html)}.` : '',
    ]);
  }

  formatVancouver(record, number, html) {
    const year = record.year || 'n.d.';
    const title = this.stripTerminalPeriod(record.title || '[Untitled]');
    const source = this.buildJournalSegment(record, 'vancouver', html);
    const doiPart = record.doi ? `doi:${this.renderValue(this.stripDoiPrefix(record.doi), html)}.` : '';

    return this.joinParts([
      `${number}.`,
      `${this.renderValue(this.formatAuthorsVancouver(record.authors), html)}.`,
      `${this.renderValue(title, html)}.`,
      source ? `${source}` : '',
      source ? '' : `${this.renderValue(String(year), html)}.`,
      doiPart,
    ]);
  }

  formatIeee(record, number, html) {
    const year = record.year || 'n.d.';
    const title = this.stripTerminalPeriod(record.title || '[Untitled]');
    const source = this.buildJournalSegment(record, 'ieee', html);
    const doiPart = record.doi ? `doi: ${this.renderValue(this.stripDoiPrefix(record.doi), html)}.` : '';

    return this.joinParts([
      `[${number}]`,
      `${this.renderValue(this.formatAuthorsIeee(record.authors), html)},`,
      `"${this.renderValue(title, html)},"`,
      source,
      `${this.renderValue(String(year), html)}.`,
      doiPart,
    ]);
  }

  buildJournalSegment(record, style, html) {
    const vp = this.parseVolumeIssuePages(record.volumePages);
    const journal = record.journal || '';
    const journalText = this.renderValue(journal, html);

    if (style === 'apa') {
      if (!journal) return '';

      let segment = html ? this.italicize(journal) : journalText;
      if (vp.volume) {
        segment += `, ${html ? this.italicize(vp.volume) : this.renderValue(vp.volume, html)}`;
        if (vp.issue) segment += `(${this.renderValue(vp.issue, html)})`;
      }

      const pagesOrArticle = vp.pages || vp.articleNumber;
      if (pagesOrArticle) segment += `, ${this.renderValue(pagesOrArticle, html)}`;
      segment += '.';
      return segment;
    }

    if (style === 'chicago') {
      if (!journal) return '';

      let segment = html ? this.italicize(journal) : journalText;
      if (vp.volume) {
        segment += ` ${this.renderValue(vp.volume, html)}`;
        if (vp.issue) segment += ` (${this.renderValue(vp.issue, html)})`;
      }

      const pagesOrArticle = vp.pages || vp.articleNumber;
      if (pagesOrArticle) {
        if (vp.volume || vp.issue) {
          segment += `: ${this.renderValue(pagesOrArticle, html)}`;
        } else {
          segment += `, ${this.renderValue(pagesOrArticle, html)}`;
        }
      }

      segment += '.';
      return segment;
    }

    if (style === 'mla') {
      const parts = [];
      if (journal) parts.push(`${html ? this.italicize(journal) : journalText},`);
      if (vp.volume) parts.push(`vol. ${this.renderValue(vp.volume, html)},`);
      if (vp.issue) parts.push(`no. ${this.renderValue(vp.issue, html)},`);
      if (vp.pages) parts.push(`pp. ${this.renderValue(vp.pages, html)},`);
      else if (vp.articleNumber) parts.push(`${this.renderValue(vp.articleNumber, html)},`);
      return this.joinParts(parts);
    }

    if (style === 'vancouver') {
      if (!journal) return '';

      let segment = `${journalText}. ${this.renderValue(String(record.year || 'n.d.'), html)}`;
      if (vp.volume) {
        segment += `;${this.renderValue(vp.volume, html)}`;
        if (vp.issue) segment += `(${this.renderValue(vp.issue, html)})`;
      }

      const pagesOrArticle = vp.pages || vp.articleNumber;
      if (pagesOrArticle) segment += `:${this.renderValue(pagesOrArticle, html)}`;
      segment += '.';
      return segment;
    }

    const ieeeParts = [];
    if (journal) ieeeParts.push(`${html ? this.italicize(journal) : journalText},`);
    if (vp.volume) ieeeParts.push(`vol. ${this.renderValue(vp.volume, html)},`);
    if (vp.issue) ieeeParts.push(`no. ${this.renderValue(vp.issue, html)},`);
    if (vp.pages) ieeeParts.push(`pp. ${this.renderValue(vp.pages, html)},`);
    else if (vp.articleNumber) ieeeParts.push(`Art. no. ${this.renderValue(vp.articleNumber, html)},`);
    return this.joinParts(ieeeParts);
  }

  parseVolumeIssuePages(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return { volume: '', issue: '', pages: '', articleNumber: '' };

    let match = raw.match(/^(\d+)\s*\(([^)]+)\)\s*,\s*(.+)$/);
    if (match) {
      return {
        volume: match[1].trim(),
        issue: match[2].trim(),
        pages: match[3].trim(),
        articleNumber: '',
      };
    }

    match = raw.match(/^(\d+)\s*,\s*(.+)$/);
    if (match) {
      return {
        volume: match[1].trim(),
        issue: '',
        pages: match[2].trim(),
        articleNumber: '',
      };
    }

    match = raw.match(/^(\d+)\s*\(([^)]+)\)$/);
    if (match) {
      return {
        volume: match[1].trim(),
        issue: match[2].trim(),
        pages: '',
        articleNumber: '',
      };
    }

    if (/^e?[a-z0-9]+$/i.test(raw)) {
      return { volume: '', issue: '', pages: '', articleNumber: raw };
    }

    if (/^[a-z0-9]+\s*[–-]\s*[a-z0-9]+$/i.test(raw)) {
      return { volume: '', issue: '', pages: raw, articleNumber: '' };
    }

    return { volume: raw, issue: '', pages: '', articleNumber: '' };
  }

  parseAuthors(value) {
    const rawList = String(value || '')
      .split(';')
      .map((name) => name.trim())
      .filter(Boolean);

    if (rawList.length === 0) {
      return [{ family: 'Unknown', given: '' }];
    }

    return rawList.map((author) => {
      if (author.includes(',')) {
        const [family, ...givenParts] = author.split(',');
        return {
          family: family.trim(),
          given: givenParts.join(',').trim(),
        };
      }

      const parts = author.split(/\s+/).filter(Boolean);
      const family = parts.length > 1 ? parts.pop() : parts[0];
      return {
        family: family || 'Unknown',
        given: parts.join(' '),
      };
    });
  }

  initialsFromGiven(given) {
    return given
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}.`)
      .join(' ');
  }

  formatAuthorsApa(authors) {
    const formatted = authors.map((author) => {
      const initials = this.initialsFromGiven(author.given);
      return initials ? `${author.family}, ${initials}` : author.family;
    });

    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
    return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
  }

  formatAuthorsChicago(authors) {
    if (authors.length === 1) {
      return `${authors[0].family}, ${authors[0].given}`.trim();
    }

    const first = `${authors[0].family}, ${authors[0].given}`.trim();
    const rest = authors.slice(1).map((author) => `${author.given} ${author.family}`.trim());
    if (rest.length === 1) return `${first}, and ${rest[0]}`;
    return `${first}, ${rest.slice(0, -1).join(', ')}, and ${rest[rest.length - 1]}`;
  }

  formatAuthorsMla(authors) {
    if (authors.length === 1) {
      return `${authors[0].family}, ${authors[0].given}`.trim();
    }

    if (authors.length === 2) {
      return `${authors[0].family}, ${authors[0].given}, and ${authors[1].given} ${authors[1].family}`.trim();
    }

    return `${authors[0].family}, ${authors[0].given}, et al`;
  }

  formatAuthorsVancouver(authors) {
    return authors
      .map((author) => `${author.family} ${this.initialsFromGiven(author.given).replace(/\s+/g, '')}`.trim())
      .join(', ');
  }

  formatAuthorsIeee(authors) {
    const formatted = authors.map((author) => `${this.initialsFromGiven(author.given)} ${author.family}`.replace(/\s+/g, ' ').trim());

    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
    return `${formatted.slice(0, -1).join(', ')}, and ${formatted[formatted.length - 1]}`;
  }

  normalizeDoi(doiValue) {
    const clean = String(doiValue || '').trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) return clean;
    return `https://doi.org/${this.stripDoiPrefix(clean)}`;
  }

  stripDoiPrefix(doiValue) {
    return String(doiValue || '').replace(/^https?:\/\/doi\.org\//i, '').trim();
  }

  ensureTerminalPunctuation(value) {
    const clean = String(value || '').trim();
    if (!clean) return '';
    return /[.!?]$/.test(clean) ? clean : `${clean}.`;
  }

  stripTerminalPeriod(value) {
    return String(value || '').replace(/[.!?]\s*$/, '').trim();
  }

  renderValue(value, html) {
    return html ? this.escapeHtml(value) : String(value || '');
  }

  joinParts(parts) {
    return parts
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+([,.;:])/g, '$1');
  }

  escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  italicize(value) {
    return `<em>${this.escapeHtml(value)}</em>`;
  }

  downloadBibliographyText() {
    if (this.citationCache.length === 0) return;
    const plainLines = this.citationCache.map((entry) => entry.text);
    const content = `Bibliography (${this.styleSelect.options[this.styleSelect.selectedIndex].text})\n\n${plainLines.join('\n\n')}\n`;
    const fileName = `bibliography-${this.currentStyle}.txt`;
    this.downloadBlob(content, fileName, 'text/plain;charset=utf-8');
    this.showStatus(`Downloaded ${fileName}.`);
  }

  downloadBibtex() {
    if (this.references.length === 0) return;

    const entries = this.references.map((record, index) => this.toBibtexEntry(record, index + 1));
    const content = `${entries.join('\n\n')}\n`;
    const fileName = 'references.bib';
    this.downloadBlob(content, fileName, 'application/x-bibtex;charset=utf-8');
    this.showStatus(`Downloaded ${fileName}.`);
  }

  toBibtexEntry(record, index) {
    const authors = record.authors;
    const firstFamily = (authors[0]?.family || 'ref').toLowerCase().replace(/[^a-z0-9]/g, '');
    const shortTitleWord = (record.title || 'entry')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)[0] || 'entry';
    const key = `${firstFamily}${record.year || 'nd'}${shortTitleWord}${index}`;

    const fields = [];
    fields.push(this.bibField('author', authors.map((author) => `${author.family}, ${author.given}`.trim()).join(' and ')));
    fields.push(this.bibField('title', record.title));
    if (record.journal) fields.push(this.bibField('journal', record.journal));
    if (record.year) fields.push(this.bibField('year', String(record.year)));

    const vp = this.parseVolumeIssuePages(record.volumePages);
    if (vp.volume) fields.push(this.bibField('volume', vp.volume));
    if (vp.issue) fields.push(this.bibField('number', vp.issue));
    if (vp.pages) fields.push(this.bibField('pages', vp.pages));
    if (vp.articleNumber) fields.push(this.bibField('eid', vp.articleNumber));
    if (record.doi) fields.push(this.bibField('doi', this.stripDoiPrefix(record.doi)));

    return `@article{${key},\n${fields.join(',\n')}\n}`;
  }

  bibField(name, value) {
    const sanitized = String(value || '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `  ${name} = {${sanitized}}`;
  }

  downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  showStatus(message) {
    this.statusMessage.textContent = message;
  }
}

new CitationGeneratorApp();
