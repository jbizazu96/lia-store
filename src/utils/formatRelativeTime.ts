/*
|--------------------------------------------------------------------------
| Relative Time Formatter
|--------------------------------------------------------------------------
|
| Formats dates into user-friendly relative times.
|
* Examples:
*
* Just now
* 2 minutes ago
* 1 hour ago
* Yesterday
* 3 days ago
* Last week
|
*/

export function formatRelativeTime(
  date: Date
): string {

  const now = new Date();

  const seconds =
    Math.floor(
      (now.getTime() - date.getTime()) / 1000
    );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days =
    Math.floor(hours / 24);

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  const weeks =
    Math.floor(days / 7);

  if (weeks === 1) {
    return "Last week";
  }

  return `${weeks} weeks ago`;

}