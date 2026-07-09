type BrandLogoProps = {
  className?: string;
  alt?: string;
};

export function BrandLogo({ className, alt = "Recurvos Account" }: BrandLogoProps) {
  return <img className={className ? `brand-logo ${className}` : "brand-logo"} src="/sidebar-logo-chatgpt.png" alt={alt} />;
}
