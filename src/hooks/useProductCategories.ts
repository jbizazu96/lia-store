"use client";

import {useEffect, useState} from "react";
import {categoryService} from "@/services/category/categoryService";
import type {Category} from "@/types/category";

export function useProductCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    let active = true;
    void categoryService.getCategories().then((result) => {
      if (active) setCategories(result);
    }).catch(() => {});
    return () => {active = false;};
  }, []);
  return categories;
}
