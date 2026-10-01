export interface LegalSection {
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalDocument {
  slug: string;
  eyebrow: string;
  title: string;
  summary: string;
  /** ISO date of the last substantive change, shown on the page. */
  updatedAt: string;
  sections: LegalSection[];
}
