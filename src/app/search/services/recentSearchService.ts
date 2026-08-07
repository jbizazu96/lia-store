/*
  Recent searches service.
*/

import {auth} from "@/lib/firebase";
import {customerProfileClientService} from "@/services/user/customerProfileClientService";

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const user = auth.currentUser;
    if (user) {
      return (await customerProfileClientService.getProfile()).recentSearches;
    } else {
      const saved = localStorage.getItem("recentSearches");
      if (saved) {
        return JSON.parse(saved);
      }
    }
    return [];
  } catch (error) {
    console.error("Error loading recent searches:", error);
    return [];
  }
}

export async function saveRecentSearch(query: string): Promise<void> {
  if (!query.trim()) return;

  try {
    const user = auth.currentUser;
    if (user) {
      await customerProfileClientService.saveRecentSearch(query.trim());
    } else {
      const saved = localStorage.getItem("recentSearches");
      const searches = saved ? JSON.parse(saved) : [];
      const updated = [query.trim(), ...searches.filter((s: string) => s !== query.trim())].slice(0, 10);
      localStorage.setItem("recentSearches", JSON.stringify(updated));
    }
  } catch (error) {
    console.error("Error saving recent search:", error);
  }
}
