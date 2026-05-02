export function bindComposerDraftActions({
  elements,
  getState,
  setState,
  saveState,
  render,
  prepareEditDraft,
  prepareRetryDraft,
}) {
  return {
    editMessage: (messageId) => prepareComposerDraft({
      elements,
      producer: () => prepareEditDraft(getState(), messageId),
      setState,
      saveState,
      render,
      statusMessage: 'Message moved back to the composer for editing.',
    }),
    retryLastAssistant: () => prepareComposerDraft({
      elements,
      producer: () => prepareRetryDraft(getState()),
      setState,
      saveState,
      render,
      statusMessage: 'Last turn moved back to the composer for retry.',
    }),
  };
}

export function prepareComposerDraft({
  elements,
  producer,
  setState,
  saveState,
  render,
  statusMessage,
}) {
  try {
    const result = producer();
    setState(result.state);
    elements.prompt.value = result.draftText;
    saveState();
    render();
    elements.prompt.focus();
    elements.providerStatus.textContent = statusMessage;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not prepare message draft.';
    elements.providerStatus.textContent = message;
  }
}
