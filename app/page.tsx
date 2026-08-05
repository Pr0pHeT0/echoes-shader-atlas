import { HomeGallery } from "./components/HomeGallery";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

export default function Home() {
  return (
    <div className="site-shell" id="top">
      <SiteHeader floating />
      <main>
        <HomeGallery />
      </main>
      <SiteFooter />
    </div>
  );
}
