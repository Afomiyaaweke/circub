// v216: instant quests now live INSIDE the Help Board (/help) - one page,
// zero navigation to a separate destination (user: "keep it in the same
// page of link don't take it on other page"). This route is kept only as a
// redirect so old links (homepage bounty buttons, bookmarks) land on the
// unified board: /help#quests opens the quest tab, ready to use.
import { redirect } from 'next/navigation'

export default function QuestsPage() {
  redirect('/help#quests')
}
