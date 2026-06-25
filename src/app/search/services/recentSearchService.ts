/*
  Recent searches service.
*/

import {doc, updateDoc, arrayUnion, getDoc} from "firebase/firestore";
import {auth, db} from "@/lib/firebase";

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const user = auth.currentUser;
    if (user) {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.recentSearches) {
          return data.recentSearches.slice(0, 10);
        }
      }
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
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        recentSearches: arrayUnion(query.trim()),
      });
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