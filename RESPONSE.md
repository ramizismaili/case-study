# Part A — Product Thinking

## 1. Questions I would ask

Before building this, I'd want to understand a few things:

- Why are users skipping AI suggestions? Are they ignoring useful feedback, or are some suggestions just not relevant?
- Should users respond to every suggestion, or only important ones?
- Is clicking Accept or Dismiss enough, or should they explain why?
- What happens if the AI fails to generate suggestions?
- If someone edits the content after reviewing the suggestions, should they review them again?

My main concern would be making sure we're solving the actual problem without making the process frustrating for users.

## 2. How I would learn more without the customer

I'd start by checking how the feature currently works and looking at existing data.

I'd try to find out how many users submit content without reviewing suggestions and whether those submissions get rejected more often.

I'd also check previous feedback from users and talk to people from support or the team who work closely with customers.

If possible, I'd test the flow myself to understand why users might skip suggestions.

## 3. Developer-ready ticket

**Title:** Require users to review AI suggestions before submitting content

**Goal:** Make sure users have considered AI suggestions before sending content for human review.

### Requirements

- Each AI suggestion should have two actions: Accept or Dismiss.
- Suggestions start with a Pending status.
- Users can see how many suggestions are still pending.
- The Submit button is disabled while there are pending suggestions.
- The backend should also check this before allowing submission.
- Responses should be saved with the user and timestamp.
- If there are no suggestions, users can submit normally.
- Show a clear message explaining why submission is blocked.

### Acceptance criteria

- Users cannot submit while suggestions are pending.
- After responding to all suggestions, submission is enabled.
- Refreshing the page doesn't lose saved responses.
- Users cannot bypass the restriction through the API.
- Existing submission behavior works when the feature is disabled.

### Assumptions

- Users can dismiss suggestions without providing a reason.
- Only suggestions related to the current content version need to be reviewed.
- Accept means acknowledging the suggestion, not automatically changing the content.

### Open questions

- Should all suggestions be mandatory to review?
- Should editing the content reset previous responses?
- What should happen if the AI service is unavailable?

**Dependencies:** Existing AI suggestions, submission API, and a way to save suggestion responses.

I'd start with this simple implementation and improve it based on user feedback rather than adding more complexity from the beginning.
