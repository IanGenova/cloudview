/**
 * CloudView is not a BIR-registered Computerized Accounting System, and its POS
 * component holds no Permit to Use. It must therefore never hand a guest a
 * document they could reasonably mistake for a Sales Invoice or Official
 * Receipt — doing so exposes the hotel to a Section 264 finding even though
 * CloudView itself is only recording the sale.
 *
 * Every printable money document renders this notice, so the distinction is
 * unambiguous at the moment the paper changes hands. Guests are pointed at the
 * front desk, which issues the real Invoice from the hotel's registered system.
 *
 * Note the wording: the Ease of Paying Taxes Act (RA 11976) made the *Invoice*
 * the primary document for sales of services, replacing the Official Receipt.
 * Both are named here because hotels sell goods and services alike, and guests
 * still ask for an "OR".
 *
 * If CloudView is ever put through BIR registration, this file is the single
 * place to revisit — the notice comes out only once the documents are genuinely
 * fiscal.
 */
export const NON_FISCAL_DOCUMENT_NOTICE =
  'This is an internal summary provided for guest reference only. It is not a BIR-registered Sales Invoice or Official Receipt. Please request your official Invoice from the front desk.';

/** Condensed form for space-constrained UI, e.g. the POS completion panel. */
export const NON_FISCAL_DOCUMENT_NOTICE_SHORT =
  'Not a BIR-registered Sales Invoice or Official Receipt.';

/**
 * Renders the notice for standalone printed documents. Styles are inline
 * because each print template ships its own stylesheet and opens in a detached
 * window with no access to the app's CSS.
 */
export function renderNonFiscalNoticeHtml(): string {
  return `<div style="margin-top:18px;padding:10px 12px;border:1px solid #999;border-radius:6px;font-size:11px;line-height:1.5;color:#333;background:#fafafa;">
      <strong style="display:block;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.06em;font-size:10px;">Not an official receipt</strong>
      ${NON_FISCAL_DOCUMENT_NOTICE}
    </div>`;
}
