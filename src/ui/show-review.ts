import { h } from "preact";
import { mountPanel } from "./mount-panel";
import { ReviewPanel, type ReviewPanelProps, type ReviewWrite } from "./ReviewPanel";

export type ShowReviewPanelOptions = Omit<ReviewPanelProps, "onApply" | "onClose">;

/**
 * Mount the multi-block `ReviewPanel`; resolve with the accepted changes on
 * Apply, or an empty list on Close / Cancel. Without a DOM container nothing
 * can be reviewed, so the fallback writes nothing.
 */
export function showReviewPanel(options: ShowReviewPanelOptions): Promise<ReviewWrite[]> {
  return mountPanel<ReviewWrite[]>([], (teardown) =>
    h(ReviewPanel, {
      ...options,
      onApply: (writes: ReviewWrite[]) => teardown(writes),
      onClose: () => teardown([]),
    }),
  );
}
