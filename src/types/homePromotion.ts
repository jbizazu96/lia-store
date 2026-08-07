export type HomePromotionTheme = "orange" | "green" | "blue" | "purple";

export interface HomePromotion {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  targetPath: string | null;
  theme: HomePromotionTheme;
  startsAt: string | null;
  endsAt: string | null;
  position: number;
  isActive: boolean;
}
