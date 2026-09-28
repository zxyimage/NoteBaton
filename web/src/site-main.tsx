import { createRoot } from "react-dom/client";
import SiteApp from "./SiteApp";
import { registerTranslations } from "./localization";
import siteMessages from "./site.messages.json";
import "./style.css";
import "./home.css";

registerTranslations(siteMessages);
createRoot(document.getElementById("root")!).render(<SiteApp />);
