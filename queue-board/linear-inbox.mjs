// linear-inbox.mjs: the human's Linear inbox for the queue board. The board's Linear key is the human's own account,
// so Linear's notifications query returns their inbox. The unread notifications are sorted three ways: aimed at them
// (a mention, an assignment, a review request, or a reply to one of their comments), comments on issues they follow,
// and other updates (status changes, due dates, PR checks). The last two are grouped one row per issue, newest first.
// One read is a single GraphQL call: the newest 250 notifications, plus the newest 100 of the aimed-at-them types so an
// older mention still shows after 250 newer notifications have pushed it out.
const AIMED_TYPES = ['issueMention', 'issueCommentMention', 'issueAssignedToYou', 'pullRequestReviewRequested'];
const NOTIFICATION = `id type category createdAt readAt archivedAt snoozedUntilAt title subtitle url groupingKey
  actor { name } botActor { name }
  ... on IssueNotification { issue { identifier } parentComment { user { id } } }`;

const kindOf = (n, me) => {
  if (n.category === 'mentions') return 'mention';
  if (n.category === 'assignments') return 'assigned';
  if (n.type === 'pullRequestReviewRequested') return 'review';
  if (n.parentComment?.user?.id === me) return 'reply';
  return null;
};
const item = (n) => ({
  type: n.type,
  at: n.createdAt,
  title: n.title ?? '',
  text: (n.subtitle ?? '').slice(0, 400),
  url: n.url,
  actor: n.actor?.name ?? n.botActor?.name ?? null,
  issue: n.issue?.identifier ?? null,
});
// One row per issue (Linear's grouping key), carrying the newest notification and how many there are. The page shows
// the newest rows and links to Linear for the rest, so only GROUP_ROWS travel in each snapshot.
const GROUP_ROWS = 40;
function byIssue(list) {
  const groups = new Map();
  for (const n of list) {
    const g = groups.get(n.groupingKey ?? n.id);
    if (g) g.count++;
    else groups.set(n.groupingKey ?? n.id, { ...item(n), count: 1 });
  }
  return { rows: [...groups.values()].slice(0, GROUP_ROWS), issues: groups.size, total: list.length };
}

// workspace (linear.workspace) builds the inbox link when no notification carries a URL to read it from.
export async function readInbox(linear, workspace = null) {
  const data = await linear(`query($aimed: [String!]) {
    viewer { id }
    notificationsUnreadCount
    recent: notifications(first: 250) { nodes { ${NOTIFICATION} } }
    aimed: notifications(first: 100, filter: { type: { in: $aimed } }) { nodes { ${NOTIFICATION} } }
  }`, { aimed: AIMED_TYPES });
  const me = data.viewer.id;
  const seen = new Set();
  const unread = [...data.recent.nodes, ...data.aimed.nodes]
    .filter((n) => !seen.has(n.id) && seen.add(n.id))
    .filter((n) => !n.readAt && !n.archivedAt && !(n.snoozedUntilAt && Date.parse(n.snoozedUntilAt) > Date.now()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const forYou = [], comments = [], updates = [];
  for (const n of unread) {
    const kind = kindOf(n, me);
    if (kind) forYou.push({ ...item(n), kind });
    else if (n.category === 'commentsAndReplies' || n.type === 'pullRequestCommented') comments.push(n);
    else updates.push(n);
  }
  const slug = data.recent.nodes.find((n) => n.url)?.url.match(/^https:\/\/linear\.app\/([^/]+)\//)?.[1] ?? workspace;
  return {
    unreadTotal: data.notificationsUnreadCount,
    // The 250 newest notifications reach back this far; older comments and updates are only counted in unreadTotal.
    since: data.recent.nodes.at(-1)?.createdAt ?? null,
    inboxUrl: slug ? `https://linear.app/${slug}/inbox` : 'https://linear.app/inbox',

    forYou,
    comments: byIssue(comments),
    updates: byIssue(updates),
  };
}
