// v239 PERF: feed payload slimming. Photos/avatars are stored as base64
// data: URLs in the DB (uploads go through /api/upload), so the feed APIs
// used to ship EVERY photo inline - megabytes of JSON per fetch, which was
// the "app is laggy" report on phones. The v117 /image routes already serve
// the same bytes at real URLs with 24h browser + edge caching, so each feed
// response swaps the data: URLs for those URLs. Nothing changes for
// uploading or for DB storage - only what travels over the wire.
export function postImageUrl(postId: string): string {
  return `/api/local-prices/${postId}/image`
}

export function userImageUrl(userId: string): string {
  return `/api/users/${userId}/image`
}

export function slimPostImage<T extends { id: string; imageUrl?: string | null }>(post: T): T {
  return post.imageUrl ? { ...post, imageUrl: postImageUrl(post.id) } : post
}

export function slimAuthor<T extends { id: string; profilePicture?: string | null }>(author: T): T {
  return author.profilePicture ? { ...author, profilePicture: userImageUrl(author.id) } : author
}
