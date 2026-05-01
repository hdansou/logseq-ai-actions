import type { ComponentChildren, FunctionComponent } from "preact";

export const Field: FunctionComponent<{
  label: string;
  error?: string | undefined;
  /**
   * Optional inline hint rendered under the input. Used for scope /
   * output-mode / kind so the user gets a description of the *currently
   * selected* value without leaving the form.
   */
  hint?: string | undefined;
  children: ComponentChildren;
}> = ({ label, error, hint, children }) => (
  <div class={`manage-field${error ? " error" : ""}`}>
    <span class="manage-field-label">{label}</span>
    {children}
    {hint ? <span class="manage-field-hint">{hint}</span> : null}
    {error ? <span class="manage-field-error">{error}</span> : null}
  </div>
);
