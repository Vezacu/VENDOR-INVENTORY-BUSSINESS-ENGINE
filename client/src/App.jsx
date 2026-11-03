import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState } from "react";
import "./App.css";

const publicLinks = [
  { label: "Home", path: "/" },
  { label: "Shop", path: "/shop" },
  { label: "Custom order", path: "/custom-order" },
  { label: "For makers", path: "/seller/register" },
  { label: "My orders", path: "/orders" },
];

const dashboardLinks = [
  { label: "Overview", path: "/seller/dashboard", icon: "◫" },
  { label: "Seller accounts", path: "/seller/accounts", icon: "♙", adminOnly: true },
  { label: "Shop settings", path: "/seller/shop-settings", icon: "⌂", sellerOnly: true },
  { label: "Products", path: "/seller/products", icon: "◇" },
  { label: "Add a product", path: "/seller/products/new", icon: "+" },
  { label: "Inventory", path: "/seller/inventory", icon: "▤" },
  { label: "Orders", path: "/seller/orders", icon: "▧" },
  { label: "Refund requests", path: "/seller/refunds", icon: "↩" },
  { label: "Custom orders", path: "/seller/custom-orders", icon: "✳" },
  { label: "Reviews", path: "/seller/reviews", icon: "☆" },
  { label: "Analytics", path: "/seller/analytics", icon: "↗" },
  { label: "Account settings", path: "/seller/account", icon: "◎" },
];

const dashboardPages = {
  "/seller/dashboard": { title: "Good morning, Aditi", eyebrow: "YOUR LITTLE CORNER", description: "Here’s what’s happening in your shop today." },
  "/seller/accounts": { title: "Seller accounts", eyebrow: "GROW THE MAKER COMMUNITY", description: "Create seller logins for makers you’ve invited to VIBE." },
  "/seller/shop-settings": { title: "Shop settings", eyebrow: "MAKE IT YOURS", description: "Tell the world a little more about your creative corner." },
  "/seller/products": { title: "Your products", eyebrow: "THE THINGS YOU MAKE", description: "Keep your creations organised and ready to find a new home." },
  "/seller/products/new": { title: "Add a product", eyebrow: "A NEW LITTLE TREASURE", description: "Add the details so shoppers can fall in love with it." },
  "/seller/products/edit": { title: "Edit product", eyebrow: "A LITTLE UPDATE", description: "Make changes to your product listing." },
  "/seller/inventory": { title: "Inventory", eyebrow: "STOCK CHECK", description: "Know what’s ready to ship and what needs a little restock." },
  "/seller/orders": { title: "Orders", eyebrow: "HAPPY MAIL", description: "Stay on top of every order from checkout to doorstep." },
  "/seller/refunds": { title: "Refund requests", eyebrow: "CUSTOMER CARE", description: "Review requests and follow Razorpay refund progress." },
  "/seller/custom-orders": { title: "Custom requests", eyebrow: "MADE JUST FOR THEM", description: "Bring someone’s just-for-me idea to life." },
  "/seller/reviews": { title: "Reviews", eyebrow: "KIND WORDS", description: "Little notes from people who love what you make." },
  "/seller/analytics": { title: "Your shop, at a glance", eyebrow: "GROWING TOGETHER", description: "A gentle look at how your little shop is doing." },
  "/seller/account": { title: "Account settings", eyebrow: "YOU, BEHIND THE SHOP", description: "Manage your personal details and sign-in preferences." },
};

const money = (amount) => `₹${Number(amount).toLocaleString("en-IN")}`;
const API_BASE_URL = import.meta.env.DEV ? "http://localhost:5000" : "";
const apiFetch = async (url, options = {}) => {
  const requestUrl = url.replace("http://localhost:5000", API_BASE_URL);
  const response = await fetch(requestUrl, options);
  const headers = new Headers(options.headers || {});
  if (response.status === 401 && headers.has("Authorization")) {
    window.dispatchEvent(new CustomEvent("vibe-session-expired"));
  }
  return response;
};

const readApiResponse = async (response) => {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    if (/^\s*(<!doctype html|<html\b)/i.test(body)) {
      throw new Error("The VIBE server returned a webpage instead of API data. Restart the backend and try again.");
    }
    throw new Error("The VIBE server returned an unreadable response. Please try again.");
  }
};

const uploadImage = async (file, kind, authToken) => {
  if (!file) throw new Error("Choose an image to upload.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Images must be 5 MB or smaller.");
  }

  const signatureResponse = await apiFetch("http://localhost:5000/api/uploads/signature", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ kind }),
  });
  const signature = await readApiResponse(signatureResponse);
  if (!signatureResponse.ok) {
    throw new Error(signature.message || "The image could not be uploaded.");
  }

  const body = new FormData();
  body.append("file", file);
  body.append("api_key", signature.apiKey);
  body.append("timestamp", String(signature.timestamp));
  body.append("folder", signature.folder);
  body.append("public_id", signature.public_id);
  body.append("signature", signature.signature);

  const response = await fetch(signature.uploadUrl, { method: "POST", body });
  const result = await readApiResponse(response);
  if (!response.ok) {
    throw new Error(result.error?.message || "The image could not be uploaded. Please try again.");
  }
  return { image: { url: result.secure_url, publicId: result.public_id } };
};

const readStorage = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

const readCart = (key) => {
  const saved = readStorage(key, []);
  return Array.isArray(saved) ? saved : [];
};

const toPublicProduct = (product) => ({
  ...product,
  id: String(product.id),
  stock: Number(product.stock),
  availability: product.availability !== false,
  maker: product.shop_name,
  shopSlug: product.shop_slug,
  image: product.image || product.images?.[0] || "",
  color: ["pink", "lavender", "sage", "coral"][Number(product.id) % 4],
  emoji: "✿",
  rating: Number(product.rating) > 0 ? Number(product.rating).toFixed(1) : "New",
  reviewCount: Number(product.review_count) || 0,
});

const storefrontTextFields = [
  { page: "Homepage", fields: [
    ["homeNote", "Homepage eyebrow", "✦ A LITTLE CORNER OF CREATIVITY ✦"],
    ["homeTitle", "Homepage title", "Handmade"],
    ["homeHighlight", "Highlighted title", "heart."],
    ["homeText", "Homepage introduction", "Discover lovely creations made by independent artists and small businesses. Find something that feels uniquely you."],
    ["homePrimaryAction", "Primary button", "Explore creations"],
    ["homeSecondaryAction", "Secondary button", "I’m a creator!"],
    ["homeNoteFooter", "Note below buttons", "♡ Made with love, shared with you ♡"],
    ["homeArtCaption", "Homepage artwork caption", "Create your own magic!"],
    ["footerTagline", "Footer tagline", "A little space for big creativity."],
    ["footerCredit", "Footer credit", "Made with ♡ for creators"],
    ["benefitOneTitle", "First benefit title", "Made with love"],
    ["benefitOneText", "First benefit text", "Discover creations with their own story."],
    ["benefitTwoTitle", "Second benefit title", "Small businesses"],
    ["benefitTwoText", "Second benefit text", "Support artists and independent makers."],
    ["benefitThreeTitle", "Third benefit title", "Custom requests"],
    ["benefitThreeText", "Third benefit text", "Find unique pieces made just for you."],
    ["benefitFourTitle", "Fourth benefit title", "Shop your way"],
    ["benefitFourText", "Fourth benefit text", "Explore lovely things at your own pace."],
    ["featuredEyebrow", "Featured products eyebrow", "A FEW LITTLE TREASURES"],
    ["featuredTitle", "Featured products title", "Featured creations"],
    ["featuredText", "Featured products description", "Thoughtful, handmade finds from our maker community."],
    ["featuredAction", "Featured products link", "Explore all"],
  ] },
  { page: "Shop page", fields: [
    ["shopEyebrow", "Shop page eyebrow", "A GOOD DAY TO BROWSE"],
    ["shopTitle", "Shop page title", "The little shop"],
    ["shopText", "Shop page description", "Find something made with care, by people who love what they do."],
  ] },
  { page: "Custom order page", fields: [
    ["customTitle", "Custom order eyebrow", "A LITTLE SOMETHING JUST FOR YOU"],
    ["customHeading", "Custom order title", "Dream it, make it."],
    ["customText", "Custom order description", "Tell a maker what you have in mind. They’ll get back to you with the possibilities."],
  ] },
];

const storefrontDefaults = Object.fromEntries(
  storefrontTextFields.flatMap(({ fields }) => fields.map(([key, , defaultValue]) => [key, defaultValue]))
);
let storefrontEditorRequested = false;
const StorefrontEditorContext = createContext(null);

const isSameAccount = (left, right) => left?.id != null && right?.id != null
  ? String(left.id) === String(right.id)
  : left?.email?.toLowerCase() === right?.email?.toLowerCase();

const cartStorageKeyFor = (user) => user?.role === "customer" && user.id != null
  ? `vibe-cart-${user.id}`
  : null;

const canEditShop = (shop, authUser) => shop && authUser?.role === "seller"
  && String(authUser.id) === String(shop.user_id);

const safeSocialUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const rememberAccount = (user, token) => {
  const storedAccounts = readStorage("vibe-accounts", []);
  const accounts = Array.isArray(storedAccounts) ? storedAccounts : [];
  const updatedAccounts = [
    { user, token },
    ...accounts.filter((account) => account?.user && account.token && !isSameAccount(account.user, user)),
  ];
  localStorage.setItem("vibe-accounts", JSON.stringify(updatedAccounts));
  return updatedAccounts;
};

const refreshRememberedAccount = (user) => {
  const storedAccounts = readStorage("vibe-accounts", []);
  const accounts = Array.isArray(storedAccounts) ? storedAccounts : [];
  const updatedAccounts = accounts.map((account) => (
    String(account.user?.id) === String(user.id) ? { ...account, user } : account
  ));
  localStorage.setItem("vibe-accounts", JSON.stringify(updatedAccounts));
  return updatedAccounts;
};

const signOutAccount = (authUser, accountSessions, setAuthUser, setAuthToken, setAccountSessions, navigate) => {
  const remainingAccounts = accountSessions.filter((account) => !isSameAccount(account.user, authUser));
  localStorage.setItem("vibe-accounts", JSON.stringify(remainingAccounts));
  localStorage.removeItem("vibe-user");
  localStorage.removeItem("vibe-token");
  setAccountSessions(remainingAccounts);
  setAuthUser(null);
  setAuthToken(null);
  navigate(authUser?.role === "customer" ? "/" : "/seller/login");
};

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("vibe-theme") === "dark");
  const [authUser, setAuthUser] = useState(() => readStorage("vibe-user", null));
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("vibe-token"));
  const [cartByAccount, setCartByAccount] = useState({});
  const [orders, setOrders] = useState(() => readStorage("vibe-orders", []));
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Everything");
  const [accountSessions, setAccountSessions] = useState(() => readStorage("vibe-accounts", []));
  const [publicProducts, setPublicProducts] = useState([]);
  const [publicProductsError, setPublicProductsError] = useState("");
  const [publicProductsLoaded, setPublicProductsLoaded] = useState(false);
  const [publicHomeShop, setPublicHomeShop] = useState(null);
  const [publicHomeProducts, setPublicHomeProducts] = useState([]);
  const [sellerShop, setSellerShop] = useState(null);
  const [directOrder, setDirectOrder] = useState(null);
  const cartStorageKey = cartStorageKeyFor(authUser);
  const activeCart = cartStorageKey
    ? cartByAccount[cartStorageKey] ?? readCart(cartStorageKey)
    : [];

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const onSessionExpired = () => {
      if (!authToken || !authUser) return;
      localStorage.removeItem("vibe-user");
      localStorage.removeItem("vibe-token");
      localStorage.removeItem("vibe-accounts");
      setAuthUser(null);
      setAuthToken(null);
      setAccountSessions([]);
      const loginPath = authUser.role === "customer" ? "/customer/login" : "/seller/login";
      if (path !== loginPath) {
        window.history.pushState({}, "", loginPath);
        setPath(loginPath);
      }
      setNotice("Your session expired. Please log in again.");
    };
    window.addEventListener("vibe-session-expired", onSessionExpired);
    return () => window.removeEventListener("vibe-session-expired", onSessionExpired);
  }, [authToken, authUser, path]);

  useEffect(() => {
    if (authUser?.role !== "seller" || !authToken) return;
    const loadSellerShop = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/shops/me", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load your shop.");
        setSellerShop({ ...result.shop, user_id: authUser.id });
      } catch (error) {
        setSellerShop(null);
        setNotice(error.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : error.message);
      }
    };
    loadSellerShop();
  }, [authToken, authUser?.id, authUser?.role]);

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    localStorage.setItem("vibe-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (cartStorageKey && cartByAccount[cartStorageKey]) {
      localStorage.setItem(cartStorageKey, JSON.stringify(cartByAccount[cartStorageKey]));
    }
  }, [cartByAccount, cartStorageKey]);
  useEffect(() => localStorage.setItem("vibe-orders", JSON.stringify(orders)), [orders]);

  useEffect(() => {
    const loadPublicProducts = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/public/products");
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load shop products.");
        if (!Array.isArray(result.products)) {
          throw new Error("The VIBE server returned an invalid product list. Restart the backend and try again.");
        }
        setPublicProducts(result.products.map(toPublicProduct));
        setPublicProductsError("");
      } catch (error) {
        setPublicProductsError(error.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : error.message);
      } finally {
        setPublicProductsLoaded(true);
      }
    };
    loadPublicProducts();
  }, []);

  useEffect(() => {
    const loadPublicHome = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/public/shops");
        const result = await readApiResponse(response);
        if (response.status === 404) {
          setPublicHomeShop(null);
          setPublicHomeProducts([]);
          return;
        }
        if (!response.ok) throw new Error(result.message || "Could not load the maker’s homepage.");
        if (!result.shop || !Array.isArray(result.products)) {
          throw new Error("The VIBE server returned invalid homepage data. Restart the backend and try again.");
        }
        setPublicHomeShop(result.shop);
        setPublicHomeProducts(result.products.map((product) => toPublicProduct({
          ...product,
          shop_name: result.shop.shop_name,
          shop_slug: result.shop.slug,
        })));
      } catch (error) {
        console.error("Public seller homepage could not be loaded:", error.message);
      }
    };
    loadPublicHome();
  }, []);

  const navigate = (to) => {
    if (to !== window.location.pathname) window.history.pushState({}, "", to);
    if (to === "/cart") setDirectOrder(null);
    setPath(to);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const link = (to) => (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  const updateCart = (updater) => {
    if (!cartStorageKey) return;
    setCartByAccount((current) => {
      const currentItems = current[cartStorageKey] ?? readCart(cartStorageKey);
      return {
        ...current,
        [cartStorageKey]: typeof updater === "function" ? updater(currentItems) : updater,
      };
    });
  };
  const addToCart = (product) => {
    if (authUser?.role !== "customer" || !authToken || !cartStorageKey) {
      if (product?.id != null) {
        sessionStorage.setItem("vibe-customer-return-path", `/product/${product.id}`);
      }
      navigate("/customer/login");
      setNotice("Create or log in to a customer account before adding items to your bag.");
      return;
    }
    if (Number(product.stock) <= 0) return;
    updateCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      return existing
        ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { ...product, quantity: 1 }];
    });
    setNotice(`${product.name} is in your cart!`);
  };
  const updateQuantity = (id, quantity) => {
    if (!cartStorageKey) return;
    updateCart((current) => {
      return quantity < 1
        ? current.filter((item) => item.id !== id)
        : current.map((item) => item.id === id ? { ...item, quantity } : item);
    });
  };
  const cartCount = activeCart.reduce((total, item) => total + item.quantity, 0);

  const buyNow = (product) => {
    if (authUser?.role !== "customer" || !authToken) {
      if (product?.id != null) {
        sessionStorage.setItem("vibe-customer-return-path", `/product/${product.id}`);
      }
      navigate("/customer/login");
      setNotice("Create or log in to a customer account before checking out.");
      return;
    }
    if (Number(product.stock) <= 0) return;
    setDirectOrder([{ ...product, quantity: 1 }]);
    localStorage.setItem("vibe-checkout-intent", "true");
    navigate("/checkout");
  };
  const pageProps = { path, navigate, link, notice, setNotice, cart: activeCart, setCart: updateCart, addToCart, updateQuantity, orders, setOrders, authUser, setAuthUser, authToken, setAuthToken, accountSessions, setAccountSessions, search, setSearch, category, setCategory, publicProducts, publicProductsError, publicProductsLoaded, publicHomeShop, publicHomeProducts, sellerShop, setSellerShop, directOrder, setDirectOrder, buyNow };
  const isSeller = path.startsWith("/seller/");
  const isAuth = path === "/seller/login" || path === "/seller/register";
  const isCustomerAuth = path === "/customer/login" || path === "/customer/register";
  const isSellerStorefront = path.startsWith("/shops/")
    || (path === "/" && authUser?.role === "seller"
      && String(sellerShop?.user_id) === String(authUser.id));
  const requiresLogin = isSeller && !isAuth;

  return (
    <div className="app">
      {!isSeller && !isCustomerAuth && <PublicHeader {...pageProps} cartCount={cartCount} darkMode={darkMode} setDarkMode={setDarkMode} />}
      {requiresLogin && (!authToken || !authUser || !["seller", "admin"].includes(authUser.role)) && <AuthPage {...pageProps} path="/seller/login" />}
      {isSeller && !isAuth && authToken && authUser && ["seller", "admin"].includes(authUser.role) && <DashboardShell {...pageProps} darkMode={darkMode} setDarkMode={setDarkMode} />}
      {isSeller && isAuth && <AuthPage {...pageProps} />}
      {isCustomerAuth && <AuthPage {...pageProps} />}
      {!isSeller && !isCustomerAuth && <PublicPage {...pageProps} />}
      {!isSeller && !isCustomerAuth && !isSellerStorefront && !["/shop", "/custom-order"].includes(path) && <Footer link={link} shop={(path === "/" || path === "/home") ? publicHomeShop : null} showBenefits={path === "/" || path === "/home"} />}
    </div>
  );
}

function PublicHeader({ path, link, cartCount, darkMode, setDarkMode, authUser, authToken, setAuthUser, setAuthToken, accountSessions, setAccountSessions, sellerShop, publicHomeShop, navigate }) {
  const [mailCountState, setMailCount] = useState({ userId: null, count: 0 });
  const [linkedShop, setLinkedShop] = useState(null);
  const linkedShopSlug = path.startsWith("/shops/") ? path.split("/")[2] : "";
  const logoShop = linkedShopSlug
    ? sellerShop?.slug === linkedShopSlug ? sellerShop : linkedShop?.slug === linkedShopSlug ? linkedShop : null
    : sellerShop || publicHomeShop;
  const shopAccount = authUser && ["seller", "admin"].includes(authUser.role);
  const mailCount = path !== "/custom-orders"
    && authUser?.role === "customer"
    && String(mailCountState.userId) === String(authUser.id)
    ? mailCountState.count
    : 0;

  useEffect(() => {
    if (!linkedShopSlug) return undefined;

    let active = true;
    const loadLinkedShop = async () => {
      try {
        const response = await apiFetch(`http://localhost:5000/api/public/shops/${encodeURIComponent(linkedShopSlug)}`);
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load this shop’s branding.");
        if (active) setLinkedShop(result.shop);
      } catch (error) {
        console.error("Storefront branding could not be loaded:", error.message);
      }
    };
    loadLinkedShop();
    return () => { active = false; };
  }, [linkedShopSlug]);

  useEffect(() => {
    if (authUser?.role !== "customer" || !authToken) return undefined;

    let active = true;
    const loadMailCount = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/custom-orders/mine", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load custom-order replies.");
        if (active) {
          const count = (result.requests || []).filter((request) => (
            ["accepted", "declined"].includes(request.status) && !request.seller_message_viewed_at
          )).length;
          setMailCount({ userId: authUser.id, count });
        }
      } catch (error) {
        console.error("Custom order reply count could not be loaded:", error.message);
      }
    };
    loadMailCount();
    const refreshInterval = window.setInterval(loadMailCount, 30000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, [authToken, authUser?.id, authUser?.role, path]);

  useEffect(() => {
    const onMailRead = () => setMailCount({ userId: authUser?.id, count: 0 });
    window.addEventListener("vibe-mail-read", onMailRead);
    return () => window.removeEventListener("vibe-mail-read", onMailRead);
  }, [authUser?.id]);

  return (
    <header className="navbar">
      <a href="/" onClick={link("/")} className={`logo${logoShop?.content?.logoImage ? " logo-with-image" : ""}`}>
        {logoShop?.content?.logoImage
          ? <img src={logoShop.content.logoImage} alt={`${logoShop.shop_name} logo`} />
          : <StorefrontLogoText value={logoShop?.content?.logoText ?? "VIBE♡"} />}
      </a>
      <nav className="nav-links" aria-label="Main navigation">
        {publicLinks.map((item) => <a key={item.path} href={item.path} onClick={link(item.path)}>{item.label}</a>)}
      </nav>
      <div className="nav-actions">
        {authUser?.role === "seller" && <button className="nav-icon-link storefront-edit-link" type="button" onClick={() => {
          const target = path.startsWith("/shops/")
            ? path
            : canEditShop(sellerShop, authUser)
              ? (path === "/shop"
                ? `/shops/${sellerShop.slug}/shop`
                : path === "/custom-order"
                  ? `/shops/${sellerShop.slug}/custom-order`
                  : `/shops/${sellerShop.slug}`)
              : path;
          storefrontEditorRequested = true;
          if (target !== path) {
            navigate(target);
          }
          window.dispatchEvent(new Event("vibe-open-storefront-editor"));
        }} aria-label="Edit this storefront page" title="Edit this storefront page">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" /><path d="M13 6 18 11" /></svg>
        </button>}
        <a className="nav-icon-link cart-link" href="/cart" onClick={link("/cart")} aria-label={`Shopping bag, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l1.3 13H3.7L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>
          {cartCount > 0 && <span className="nav-count-badge">{cartCount}</span>}
        </a>
        <a className="nav-icon-link mail-link" href="/custom-orders" onClick={link("/custom-orders")} aria-label={`Custom order messages${mailCount ? `, ${mailCount} replies` : ""}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
          {mailCount > 0 && <span className="nav-count-badge">{mailCount}</span>}
        </a>
        <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle colour theme">{darkMode ? "☼" : "☾"}</button>
        <a className="button button-outline nav-login" href={shopAccount ? "/seller/dashboard" : authUser?.role === "customer" ? "/checkout" : "/seller/login"} onClick={link(shopAccount ? "/seller/dashboard" : authUser?.role === "customer" ? "/checkout" : "/seller/login")}>{shopAccount ? "My shop" : authUser?.role === "customer" ? "Checkout" : "Log in"}</a>
        <AccountMenu {...{ authUser, authToken, setAuthUser, setAuthToken, accountSessions, setAccountSessions, navigate }} />
      </div>
    </header>
  );
}

function AccountMenu({ authUser, setAuthUser, setAuthToken, accountSessions = [], setAccountSessions, navigate }) {
  const switchAccount = (account) => {
    localStorage.setItem("vibe-user", JSON.stringify(account.user));
    localStorage.setItem("vibe-token", account.token);
    setAuthUser(account.user);
    setAuthToken(account.token);
    navigate(account.user.role === "customer" ? "/" : "/seller/dashboard");
  };
  const loginPath = authUser?.role === "seller" || authUser?.role === "admin"
    ? "/seller/login"
    : "/customer/login";

  return <details className="account-menu public-account-menu">
    <summary className="avatar-small" aria-label="Open account menu" title="Account">
      {authUser?.profileImage
        ? <img src={authUser.profileImage} alt="" />
        : authUser?.name?.charAt(0)?.toUpperCase() || "M"}
    </summary>
    <div className="account-popover">
      <div className="account-menu-heading">
        <strong>{authUser?.name || "Your account"}</strong>
        <span>{authUser?.email || "Sign in to manage your account"}</span>
      </div>
      {accountSessions.length > 1 && <div className="account-switch-list">
        <span className="account-menu-label">SWITCH ACCOUNT</span>
        {accountSessions.filter((account) => !isSameAccount(account.user, authUser)).map((account) => (
          <button className="account-switch-option" key={account.user.id || account.user.email} onClick={() => switchAccount(account)}>
            <span className="account-option-avatar">{account.user?.profileImage
              ? <img src={account.user.profileImage} alt="" />
              : account.user?.name?.charAt(0)?.toUpperCase() || "M"}</span>
            <span><strong>{account.user?.name || "VIBE account"}</strong><small>{account.user?.email}</small></span>
            <span className="account-option-arrow">↗</span>
          </button>
        ))}
      </div>}
      {authUser && <a className="account-menu-action" href={authUser.role === "seller" || authUser.role === "admin" ? "/seller/account" : "/account"} onClick={(event) => {
        event.preventDefault();
        navigate(authUser.role === "seller" || authUser.role === "admin" ? "/seller/account" : "/account");
      }}>◎ Account details</a>}
      <button className="account-menu-action" onClick={() => navigate(loginPath)}>
        {accountSessions.length > 0 ? "＋ Add / switch account" : "↗ Log in"}
      </button>
      {authUser && <button className="account-menu-action account-signout" onClick={() => signOutAccount(authUser, accountSessions, setAuthUser, setAuthToken, setAccountSessions, navigate)}>↗ Log out</button>}
    </div>
  </details>;
}

function StorefrontLogoText({ value }) {
  return value === "VIBE♡" ? <>VIBE<span className="logo-heart">♡</span></> : value;
}

function Footer({ link, shop, showBenefits = false }) {
  const editor = useContext(StorefrontEditorContext);
  const content = { ...shop?.content, ...editor?.content };
  const contactEmail = shop?.content?.contactEmail ?? "mycontactemail";
  const contactPhone = shop?.content?.contactPhone ?? "9000000000";
  const featureCopy = [
    ["🎨", content.benefitOneTitle || storefrontDefaults.benefitOneTitle, content.benefitOneText || storefrontDefaults.benefitOneText],
    ["🌼", content.benefitTwoTitle || storefrontDefaults.benefitTwoTitle, content.benefitTwoText || storefrontDefaults.benefitTwoText],
    ["💌", content.benefitThreeTitle || storefrontDefaults.benefitThreeTitle, content.benefitThreeText || storefrontDefaults.benefitThreeText],
    ["♡", content.benefitFourTitle || storefrontDefaults.benefitFourTitle, content.benefitFourText || storefrontDefaults.benefitFourText],
  ];
  return (
    <footer className="footer">
      {showBenefits && <div className="footer-benefits">{featureCopy.map(([icon, title, description]) => <article key={title}><span>{icon}</span><h3>{title}</h3><p>{description}</p></article>)}</div>}
      <div className="footer-inner">
        <div className="footer-brand"><a href="/" onClick={link("/")} className={`logo${content.logoImage ? " logo-with-image" : ""}`}>{content.logoImage ? <img src={content.logoImage} alt={`${shop?.shop_name || "VIBE"} logo`} /> : <StorefrontLogoText value={content.logoText ?? "VIBE♡"} />}</a><p><InlineStorefrontText field="footerTagline" fallback={content.footerTagline ?? "A little space for big creativity."} /></p><span className="footer-credit"><InlineStorefrontText field="footerCredit" fallback={content.footerCredit ?? "Made with ♡ for creators"} /></span></div>
        <div className="footer-details">
          <nav className="footer-links" aria-label="Footer navigation"><a href="/shop" onClick={link("/shop")}>Shop the collection</a><a href="/custom-order" onClick={link("/custom-order")}>Custom requests</a><a href="/seller/register" onClick={link("/seller/register")}>Open a shop</a></nav>
          <div className="footer-contact"><a href={`mailto:${contactEmail}`}><span>Email</span>{contactEmail}</a><a href={`tel:${contactPhone}`}><span>Phone</span>{contactPhone}</a></div>
        </div>
      </div>
    </footer>
  );
}

function PublicPage(props) {
  const { path } = props;
  if (props.authUser?.role === "seller" && (path === "/shop" || path === "/custom-order")) {
    if (!canEditShop(props.sellerShop, props.authUser)) return <main className="page-wrap"><p role="status">Loading your shop…</p></main>;
    const shopPath = path === "/shop"
      ? `/shops/${props.sellerShop.slug}/shop`
      : `/shops/${props.sellerShop.slug}/custom-order`;
    return <SellerShopPage {...props} path={shopPath} />;
  }
  if ((path === "/" || path === "/home") && props.authUser?.role === "seller"
    && String(props.sellerShop?.user_id) === String(props.authUser.id)) {
    return <SellerShopPage {...props} path={`/shops/${props.sellerShop.slug}`} />;
  }
  if (path === "/" || path === "/home") return <HomePage
    {...props}
    shop={props.publicHomeShop}
    products={props.publicHomeShop ? props.publicHomeProducts : undefined}
  />;
  if (path.startsWith("/shops/") && (path.endsWith("/shop") || path.endsWith("/custom-order"))) return <SellerShopPage {...props} />;
  if (path === "/shop") return <ShopPage {...props} />;
  if (path.startsWith("/product/")) return <ProductPage {...props} />;
  if (path.startsWith("/shops/") && path.endsWith("/custom-order")) return <CustomOrderPage {...props} />;
  if (path.startsWith("/shops/")) return <SellerShopPage {...props} />;
  if (path === "/custom-order") return <CustomOrderPage {...props} />;
  if (path === "/cart") return <CartPage {...props} />;
  if (path === "/checkout") return <CheckoutPage {...props} />;
  if (path === "/confirmation") return <ConfirmationPage {...props} />;
  if (path === "/tracking") return <TrackingPage {...props} />;
  if (path === "/account") return <CustomerAccountPage {...props} />;
  if (path === "/custom-orders") return <CustomerCustomOrdersPage {...props} />;
  if (path === "/orders") return <CustomerOrdersPage {...props} />;
  if (path.startsWith("/orders/")) return <CustomerOrderDetails {...props} orderId={path.slice("/orders/".length)} />;
  return <HomePage {...props} />;
}

function StorefrontLiveEditor({ shop, authUser, authToken, page, onPreview = () => {}, onSaved, children }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(() => shop?.content || {});
  const [heroImage, setHeroImage] = useState(() => shop?.hero_image || "");
  const [editingField, setEditingField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const editable = canEditShop(shop, authUser);

  useEffect(() => {
    const openEditor = () => {
      if (editable) {
        storefrontEditorRequested = false;
        setOpen(true);
      }
    };
    if (storefrontEditorRequested) openEditor();
    window.addEventListener("vibe-open-storefront-editor", openEditor);
    return () => window.removeEventListener("vibe-open-storefront-editor", openEditor);
  }, [editable]);

  const changeField = (key, value) => {
    const nextContent = { ...content, [key]: value };
    setContent(nextContent);
    onPreview(nextContent);
    setError("");
  };

  const uploadStorefrontImage = async (file, target) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadImage(file, "product", authToken);
      if (target === "hero") setHeroImage(result.image.url);
      else changeField("logoImage", result.image.url);
    } catch (uploadError) {
      setError(uploadError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("http://localhost:5000/api/shops/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
        body: JSON.stringify({
          shopName: shop.shop_name,
          description: shop.description || "",
          content,
          heroImage,
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not save this storefront page.");
      const updatedShop = { ...result.shop, user_id: authUser.id };
      setContent(updatedShop.content || {});
      onPreview(updatedShop.content || {});
      onSaved(updatedShop);
    } catch (saveError) {
      setError(saveError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const editor = {
    content,
    enabled: open,
    heroImage,
    uploadStorefrontImage,
    uploading,
    editingField,
    setEditingField,
    changeField,
  };

  return <StorefrontEditorContext.Provider value={editor}>
    {editable && <section className="storefront-live-editor" aria-label={`${page} editing controls`}>
      {open && <div className="storefront-editor-actions">
        <span>Choose any <strong>[edit]</strong> beside editable page text. Preview changes as you type.</span>
        <div className="storefront-logo-tools">
          {!content.logoImage && <label className="storefront-logo-text">Text logo
            <input maxLength={50} value={content.logoText ?? "VIBE♡"} onChange={(event) => changeField("logoText", event.target.value)} />
          </label>}
          <label className="button button-outline">{uploading ? "Uploading…" : content.logoImage ? "Change logo image" : "Use logo image"}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || saving} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; uploadStorefrontImage(file, "logo"); }} />
          </label>
          {content.logoImage && <button className="button button-outline" type="button" disabled={saving} onClick={() => changeField("logoImage", "")}>Use text logo</button>}
        </div>
        <div><button className="button button-outline" type="button" onClick={() => { setOpen(false); setEditingField(null); }}>{`Done editing`}</button>
          <button className="button button-primary" type="button" disabled={saving || uploading} onClick={save}>{saving ? "Saving…" : "Save changes ♡"}</button></div>
        <Notice message={error} tone="error" />
      </div>}
    </section>}
    {children}
  </StorefrontEditorContext.Provider>;
}

function InlineStorefrontText({ field, fallback, as: Element = "span", className = "", multiline = false }) {
  const editor = useContext(StorefrontEditorContext);
  if (!editor) return <Element className={className}>{fallback}</Element>;
  const value = editor.content[field] ?? fallback;
  const isEditing = editor.enabled && editor.editingField === field;
  return <Fragment>
    {isEditing
      ? multiline
        ? <textarea className={`inline-storefront-input ${className}`} autoFocus rows={3} maxLength={500} aria-label={`Edit ${field}`} value={value} onChange={(event) => editor.changeField(field, event.target.value)} />
        : <input className={`inline-storefront-input ${className}`} autoFocus maxLength={500} aria-label={`Edit ${field}`} value={value} onChange={(event) => editor.changeField(field, event.target.value)} />
      : <Element className={className}>{value}</Element>}
    {editor.enabled && !isEditing && <button className="inline-edit-button" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); editor.setEditingField(field); }}>[edit]</button>}
  </Fragment>;
}

function HomePage({ link, addToCart, publicProducts, publicProductsError, publicProductsLoaded, shop, products: shopProducts }) {
  const content = shop?.content || {};
  const text = (key) => content[key] ?? storefrontDefaults[key];
  const featuredProducts = shopProducts || publicProducts;
  const featuredError = shop ? "" : publicProductsError;
  const featuredLoaded = shop ? true : publicProductsLoaded;
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <InlineStorefrontText field="homeNote" fallback={text("homeNote")} as="span" className="eyebrow" />
          <h1><InlineStorefrontText field="homeTitle" fallback={text("homeTitle")} className="hero-title-copy" />{" "}<InlineStorefrontText field="homeHighlight" fallback={text("homeHighlight")} as="span" className="highlight" /></h1>
          <InlineStorefrontText field="homeText" fallback={text("homeText")} as="p" className="" multiline />
          <div className="hero-actions"><a href={shop ? `/shops/${shop.slug}/shop` : "/shop"} onClick={link(shop ? `/shops/${shop.slug}/shop` : "/shop")} className="button button-primary"><InlineStorefrontText field="homePrimaryAction" fallback={text("homePrimaryAction")} /> <span>↗</span></a><a href={shop ? `/shops/${shop.slug}/custom-order` : "/seller/register"} onClick={link(shop ? `/shops/${shop.slug}/custom-order` : "/seller/register")} className="button button-outline"><InlineStorefrontText field="homeSecondaryAction" fallback={text("homeSecondaryAction")} /></a></div>
          <div className="hero-note"><InlineStorefrontText field="homeNoteFooter" fallback={text("homeNoteFooter")} /></div>
        </div>
        <StorefrontHeroArtwork shop={shop} />
      </section>
      <section className="featured">
        <div className="section-heading"><div><InlineStorefrontText field="featuredEyebrow" fallback={text("featuredEyebrow")} as="span" className="eyebrow" /><h2><InlineStorefrontText field="featuredTitle" fallback={text("featuredTitle")} /> <span>✿</span></h2><InlineStorefrontText field="featuredText" fallback={text("featuredText")} as="p" multiline /></div><a href={shop ? `/shops/${shop.slug}/shop` : "/shop"} onClick={link(shop ? `/shops/${shop.slug}/shop` : "/shop")} className="text-link"><InlineStorefrontText field="featuredAction" fallback={text("featuredAction")} /> ↗</a></div>
        {featuredError && <Notice message={featuredError} tone="error" />}
        {featuredProducts.length ? <ProductGrid products={featuredProducts.slice(0, 4)} link={link} addToCart={addToCart} /> : featuredError ? <EmptyState title="Creations couldn’t load" text={featuredError} action="Try again" onAction={() => window.location.reload()} /> : featuredLoaded ? <EmptyState title="No creations listed yet" text={shop ? "Add an available product to your shop and it will appear here." : "Products will appear here as soon as a seller adds an available item."} /> : <p role="status">Loading creations from our makers…</p>}
      </section>
      <section className="seller-banner"><span className="banner-doodle">✳</span><div><span className="eyebrow">YOUR CREATIVE JOURNEY STARTS HERE</span><h2>Got something lovely to share?</h2><p>Create your own little shop and keep your products and orders organised.</p></div><a href={shop ? `/shops/${shop.slug}/custom-order` : "/seller/register"} onClick={link(shop ? `/shops/${shop.slug}/custom-order` : "/seller/register")} className="button button-dark">Join VIBE ♡</a></section>
      {shop && <StorefrontContact shop={shop} />}
    </main>
  );
}

function StorefrontHeroArtwork({ shop }) {
  const editor = useContext(StorefrontEditorContext);
  const image = editor?.heroImage ?? shop?.hero_image;
  const uploadInput = <input type="file" accept="image/jpeg,image/png,image/webp" disabled={editor?.uploading} onChange={(event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    editor?.uploadStorefrontImage(file, "hero");
  }} />;
  return <div className="hero-art" aria-label="A playful handmade art illustration">
    <span className="art-sun">✳</span>
    <div className="art-card art-card-back">✿</div>
    <div className="art-card art-card-front">
      <span className="art-sparkle">✦</span>
      {image ? <img className="art-main-image" src={image} alt={`${shop?.shop_name || "Shop"} custom artwork`} />
        : editor?.enabled
          ? <label className="art-image-add">{editor.uploading ? "Uploading…" : "＋ Add image"}{uploadInput}</label>
          : <span className="art-main">🎨</span>}
      {image && editor?.enabled && <label className="art-image-change">{editor.uploading ? "Uploading…" : "Change image"}{uploadInput}</label>}
      <span className="art-caption"><InlineStorefrontText field="homeArtCaption" fallback="Create your own magic!" /></span>
    </div>
    <span className="doodle doodle-heart">♡</span><span className="doodle doodle-star">✧</span><span className="doodle doodle-flower">✿</span>
  </div>;
}

function StorefrontContact({ shop }) {
  const content = shop.content || {};
  const socialProfiles = {
    instagramUrl: "https://www.instagram.com/",
    twitterUrl: "https://x.com/",
    facebookUrl: "https://www.facebook.com/",
    blueskyUrl: "https://bsky.app/",
  };
  const socialLinks = [
    { key: "instagramUrl", label: "Instagram", fallback: shop.instagram_link },
    { key: "twitterUrl", label: "Twitter / X" },
    { key: "facebookUrl", label: "Facebook" },
    { key: "blueskyUrl", label: "Bluesky" },
  ].map((item) => ({ ...item, href: safeSocialUrl(content[item.key] || item.fallback) || socialProfiles[item.key] }));
  return <section className="storefront-social" aria-label="Social accounts">
    <h2>Find us around the web</h2>
    <div className="social-icons">{socialLinks.map((item) => <a className={`social-icon social-icon-${item.key}`} href={item.href} target="_blank" rel="noreferrer" aria-label={item.label} title={item.label} key={item.key}>
      {item.key === "instagramUrl" && <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle className="icon-dot" cx="17.5" cy="6.7" r="1" /></svg>}
      {item.key === "twitterUrl" && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 3H22l-6.8 7.8L23.2 21h-6.3L12 14.8 6.5 21H3.3l7.3-8.4L2.8 3h6.5l4.5 5.9L18.9 3Zm-1.1 16h1.7L8.3 4.9H6.5L17.8 19Z" /></svg>}
      {item.key === "facebookUrl" && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-8h2.8l.4-3.2h-3.2v-2c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.2H7.3V13h2.8v8h3.4Z" /></svg>}
      {item.key === "blueskyUrl" && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11.5C10.8 9.2 7.1 5.2 4.8 3.7 2.6 2.2 1.7 2.5 1.2 3.4.7 4.3.8 7 .9 8.1c.4 3.6 2.2 4.6 4.8 5-2.7-.3-5.1.1-4.2 3.2.8 2.8 3 3.6 5.3 2.3 2-1.1 3.8-3.4 5.2-6 1.4 2.6 3.2 4.9 5.2 6 2.3 1.3 4.5.5 5.3-2.3.9-3.1-1.5-3.5-4.2-3.2 2.6-.4 4.4-1.4 4.8-5 .1-1.1.2-3.8-.3-4.7-.5-.9-1.4-1.2-3.6.3-2.3 1.5-6 5.5-7.2 7.8Z" /></svg>}
    </a>)}</div>
  </section>;
}

function ProductGrid({ products: items, link, addToCart }) {
  return <div className="product-grid">{items.map((product) => {
    const outOfStock = Number(product.stock) <= 0;
    return <article className="product-card" key={product.id}><a className={`product-art ${product.color}`} href={`/product/${product.id}`} onClick={link(`/product/${product.id}`)}>{product.image ? <img src={product.image} alt={product.name} /> : <span className="product-emoji">{product.emoji}</span>}{outOfStock && <span className="stock-badge">Out of stock</span>}<span className="product-heart">♡</span></a><div className="product-info"><span className="product-category">{product.category} · {product.maker}</span><a href={`/product/${product.id}`} onClick={link(`/product/${product.id}`)}><h3>{product.name}</h3></a><div className="product-bottom"><span className="product-price">{money(product.price)}</span><button className="add-button" disabled={outOfStock} onClick={() => addToCart(product)} aria-label={outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to bag`}>＋</button></div></div></article>;
  })}</div>;
}

function ShopPage({ link, addToCart, search, setSearch, category, setCategory, publicProducts, publicProductsError, publicProductsLoaded, shop, products: shopProducts }) {
  const content = shop?.content || {};
  const items = shopProducts || publicProducts;
  const error = shop ? "" : publicProductsError;
  const loaded = shop ? true : publicProductsLoaded;
  const categories = ["Everything", ...new Set(items.map((product) => product.category))];
  const filtered = items.filter((product) => (category === "Everything" || product.category === category) && `${product.name} ${product.maker}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="page-wrap"><div className="page-heading"><InlineStorefrontText field="shopEyebrow" fallback={content.shopEyebrow ?? storefrontDefaults.shopEyebrow} as="span" className="eyebrow" /><InlineStorefrontText field="shopTitle" fallback={content.shopTitle ?? storefrontDefaults.shopTitle} as="h1" /><InlineStorefrontText field="shopText" fallback={content.shopText ?? storefrontDefaults.shopText} as="p" multiline /></div>{error && <Notice message={error} tone="error" />}<div className="shop-toolbar"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search treasures or makers" aria-label="Search products" /></label><div className="select-wrap"><span className="sr-only">Filter by category</span><ThemedSelect ariaLabel="Filter by category" value={category} onChange={setCategory} options={categories} /></div></div>{filtered.length ? <ProductGrid products={filtered} link={link} addToCart={addToCart} /> : error ? <EmptyState title="Products couldn’t load" text={error} action="Try again" onAction={() => window.location.reload()} /> : !loaded ? <p role="status">Loading creations from our makers…</p> : items.length ? <EmptyState title="No matching creations" text="Try another search or explore everything in the shop." action="Clear filters" onAction={() => { setSearch(""); setCategory("Everything"); }} /> : <EmptyState title="No products listed yet" text="Seller products will appear here when they’re available to buy." />}</main>;
}

function ProductPage({ path, navigate, link, addToCart, buyNow, publicProducts, publicProductsLoaded, publicProductsError, authUser }) {
  const product = publicProducts.find((item) => item.id === path.split("/")[2]);
  if (!publicProductsLoaded && !publicProductsError) return <main className="page-wrap"><p>Loading this creation…</p></main>;
  if (publicProductsError) return <main className="page-wrap"><Notice message={publicProductsError} tone="error" /></main>;
  if (!product) return <main className="page-wrap"><EmptyState title="This creation isn’t available" text="It may have sold out or been removed by its maker." action="Browse the shop" href="/shop" link={link} /></main>;
  const outOfStock = Number(product.stock) <= 0;
  return <main className="page-wrap"><a href="/shop" onClick={link("/shop")} className="back-link">← Back to the shop</a><section className="product-detail"><div className={`detail-art ${product.color}`}>{product.image ? <img src={product.image} alt={product.name} /> : <span>{product.emoji}</span>}{outOfStock && <span className="stock-badge">Out of stock</span>}</div><div className="detail-copy"><span className="eyebrow">{product.category.toUpperCase()} · MADE BY HAND</span><h1>{product.name}</h1><a href={`/shops/${product.shopSlug}`} onClick={link(`/shops/${product.shopSlug}`)} className="maker-link">A little something by {product.maker} ↗</a><strong className="detail-price">{money(product.price)}</strong><p>{product.description || "A thoughtful, one-of-a-kind piece made in small batches with lots of love."}</p><div className={`detail-stock${outOfStock ? " detail-stock-out" : ""}`}>{outOfStock ? "Out of stock" : `✳ Ready to ship · ${product.stock} in the maker’s studio`}</div><button className="button button-primary full-button" disabled={outOfStock} onClick={() => addToCart(product)}>{outOfStock ? "Out of stock" : `Add to bag · ${money(product.price)}`}</button><button className="button button-outline full-button" disabled={outOfStock} onClick={() => buyNow(product)}>{outOfStock ? "Unavailable to order" : "Order this item now ↗"}</button><button className="text-button" onClick={() => navigate(`/shops/${product.shopSlug}/custom-order`)}>Want one made just for you? Request a custom piece ↗</button>  <ProductReviews product={product} authUser={authUser} navigate={navigate} /><div className="detail-note">♡ Packed by the maker · Ships in 2–4 days · Easy, thoughtful gifting</div></div></section></main>;
}

function ProductReviews({ product, authUser, navigate }) {
  const [reviews, setReviews] = useState([]);
  const [visibleCount, setVisibleCount] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const loadReviews = async () => {
      try {
        const response = await apiFetch(`http://localhost:5000/api/public/products/${encodeURIComponent(product.id)}/reviews`);
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load product reviews.");
        if (active) setReviews(result.reviews);
      } catch (requestError) {
        if (active) setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadReviews();
    return () => { active = false; };
  }, [product.id]);

  const reviewCount = reviews.length || product.reviewCount;
  const averageRating = reviews.length
    ? (reviews.reduce((total, review) => total + Number(review.rating), 0) / reviews.length).toFixed(1)
    : product.rating;
  return <section className="product-reviews">
    <div className="product-reviews-heading"><div><h2>Reviews</h2><p>{reviewCount ? `${averageRating} out of 5 · ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}` : "Be the first to share what you think."}</p></div>{reviewCount > 0 && <span aria-label={`${averageRating} out of 5 stars`}>{"★".repeat(Math.round(Number(averageRating)))}{"☆".repeat(5 - Math.round(Number(averageRating)))}</span>}</div>
    {error && <Notice message={error} tone="error" />}
    {loading ? <p role="status">Loading reviews…</p>
      : reviews.length === 0 ? <p className="form-hint">Verified reviews appear after a delivered order.</p>
        : <div className="product-review-list">{reviews.slice(0, visibleCount).map((review) => <article className="product-review" key={review.id}>
          <div className="product-review-byline"><span aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span><strong>{review.customer_name}</strong><time>{new Date(review.created_at).toLocaleDateString()}</time></div>
          {review.comment && <p>{review.comment}</p>}
          {review.images?.length > 0 && <div className="review-images">{review.images.map((image, index) => <a key={image} href={image} target="_blank" rel="noreferrer"><img src={image} alt={`Customer review image ${index + 1}`} /></a>)}</div>}
        </article>)}</div>}
    {reviews.length > visibleCount && <button className="button button-outline load-more-reviews" onClick={() => setVisibleCount((count) => count + 4)}>Load more reviews</button>}
    {authUser?.role !== "customer" && <button className="text-button review-login-link" onClick={() => {
      sessionStorage.setItem("vibe-customer-return-path", `/product/${product.id}`);
      navigate("/customer/login");
    }}>Log in as a customer to leave a review ↗</button>}
  </section>;
}

function SellerShopPage({ path, link, addToCart, authUser, navigate, ...pageProps }) {
  const slug = path.split("/")[2];
  const [shop, setShop] = useState(null);
  const [shopProducts, setShopProducts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadShop = async () => {
      try {
        const response = await apiFetch(`http://localhost:5000/api/public/shops/${encodeURIComponent(slug)}`);
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load this shop.");
        setShop(result.shop);
        setShopProducts(result.products.map((product) => toPublicProduct({
          ...product,
          shop_name: result.shop.shop_name,
          shop_slug: result.shop.slug,
        })));
        setError("");
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      }
    };
    loadShop();
  }, [slug]);

  const isCatalogPage = path.endsWith("/shop") || path.endsWith("/custom-order");
  const showBenefits = !isCatalogPage;
  if (error) return <><main className="page-wrap"><Notice message={error} tone="error" /></main>{!isCatalogPage && <Footer link={link} showBenefits={showBenefits} />}</>;
  if (!shop) return <><main className="page-wrap"><p>Loading this maker’s shop…</p></main>{!isCatalogPage && <Footer link={link} showBenefits={showBenefits} />}</>;
  const updateShop = (updatedShop) => {
    setShop(updatedShop);
    pageProps.setSellerShop?.(updatedShop);
  };
  const storefrontProps = { ...pageProps, path, link, addToCart, authUser, navigate, shop, products: shopProducts, setSellerShop: updateShop };
  const storefrontPage = path.endsWith("/custom-order")
    ? <CustomOrderPage {...storefrontProps} />
    : path.endsWith("/shop")
      ? <ShopPage {...storefrontProps} />
      : <HomePage {...storefrontProps} />;
  return <StorefrontLiveEditor
    key={`${shop.id}-storefront`}
    shop={shop}
    authUser={authUser}
    authToken={pageProps.authToken}
    page={path.endsWith("/shop") ? "shop page" : path.endsWith("/custom-order") ? "custom order page" : "homepage"}
    onSaved={updateShop}
  >
    {storefrontPage}
    {!isCatalogPage && <Footer link={link} shop={shop} showBenefits={showBenefits} />}
  </StorefrontLiveEditor>;
}

function CustomOrderPage({ path, setNotice, notice, shop: storefrontShop, authUser, authToken, navigate }) {
  const slug = path.startsWith("/shops/") ? path.split("/")[2] : "";
  const [loadedShop, setLoadedShop] = useState(null);
  const [shopError, setShopError] = useState("");
  const [ideaImages, setIdeaImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug || storefrontShop) return;
    const loadShop = async () => {
      try {
        const response = await apiFetch(`http://localhost:5000/api/public/shops/${encodeURIComponent(slug)}`);
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load this maker’s custom-order page.");
        setLoadedShop(result.shop);
        setShopError("");
      } catch (requestError) {
        setShopError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      }
    };
    loadShop();
  }, [slug, storefrontShop]);

  useEffect(() => {
    if (slug || storefrontShop) return;
    const loadDefaultShop = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/public/shops");
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load the maker’s shop.");
        setLoadedShop(result.shop);
      } catch (requestError) {
        setShopError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      }
    };
    loadDefaultShop();
  }, [slug, storefrontShop]);

  const uploadIdeaImages = async (event) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = "";
    setError("");
    if (ideaImages.length + files.length > 3) {
      setError("Choose up to three idea images.");
      return;
    }
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const result = await uploadImage(file, "customOrder", authToken);
        uploaded.push(result.image.url);
      }
      setIdeaImages((current) => [...current, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (authUser?.role !== "customer") {
      sessionStorage.setItem("vibe-customer-return-path", path);
      navigate("/customer/login");
      return;
    }
    setSaving(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("http://localhost:5000/api/custom-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          shopId: shop.id,
          description: formData.get("description"),
          phone: formData.get("phone") || "",
          images: ideaImages,
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not send your custom request.");
      setNotice("Your idea is with the maker. Check Mail for their reply.");
      navigate("/custom-orders");
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const shop = storefrontShop || loadedShop;
  const content = shop?.content || {};
  if (!shop && !shopError) return <main className="page-wrap"><p>Loading this maker’s custom-order page…</p></main>;
  if (shopError) return <main className="page-wrap"><Notice message={shopError} tone="error" /></main>;
  return <main className="page-wrap narrow-wrap">
    <div className="page-heading"><InlineStorefrontText field="customTitle" fallback={content.customTitle ?? storefrontDefaults.customTitle} as="span" className="eyebrow" /><InlineStorefrontText field="customHeading" fallback={content.customHeading ?? storefrontDefaults.customHeading} as="h1" /><InlineStorefrontText field="customText" fallback={content.customText ?? storefrontDefaults.customText} as="p" multiline /></div>
    <Notice message={notice} />
    {authUser?.role !== "customer" ? <section className="paper-card form-card order-login-prompt">
      <p>Your custom requests and the maker’s replies are saved to your customer account.</p>
      <button className="button button-primary" onClick={() => { sessionStorage.setItem("vibe-customer-return-path", path); navigate("/customer/login"); }}>Customer log in to share your idea ↗</button>
    </section> : <form className="paper-card form-card" onSubmit={submit}>
      <Field label="Your name" required><input required value={authUser.name || ""} readOnly /></Field>
      <div className="form-row">
        <Field label="Email address" required><input required type="email" value={authUser.email || ""} readOnly /></Field>
        <Field label="Phone number"><input name="phone" type="tel" defaultValue={authUser.phone || ""} placeholder="Optional" /></Field>
      </div>
      <Field label="Your idea" required><textarea name="description" required rows="5" maxLength={5000} placeholder="Tell us about the colours, size, occasion, or anything else you’re dreaming of…" /></Field>
      <Field label="Inspiration images (up to 3)"><label className="image-picker">{uploading ? "Uploading…" : "＋ Add images"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || ideaImages.length >= 3} onChange={uploadIdeaImages} /></label></Field>
      {ideaImages.length > 0 && <div className="image-preview-list">{ideaImages.map((image, index) => <div key={image}><img src={image} alt={`Idea inspiration ${index + 1}`} /><button type="button" className="remove-button" onClick={() => setIdeaImages((current) => current.filter((item) => item !== image))} aria-label={`Remove inspiration image ${index + 1}`}>×</button></div>)}</div>}
      <Notice message={error} tone="error" />
      <p className="form-hint">Your request goes straight to {shop.shop_name}. The maker will send a price and reply before any payment is due.</p>
      <button className="button button-primary" type="submit" disabled={saving || uploading}>{saving ? "Sending your idea…" : "Send your idea ✳"}</button>
    </form>}
  </main>;
}

function CartPage({ cart, updateQuantity, link, authUser, authToken, navigate }) {
  if (authUser?.role !== "customer" || !authToken) return <main className="page-wrap">
    <PageHeading eyebrow="YOUR LITTLE FINDS" title="Your bag" text="Sign in to a customer account to keep a personal shopping bag." />
    <EmptyState title="A little account comes first" text="Create a customer account or log in before adding items to your bag." action="Customer login" onAction={() => navigate("/customer/login")} />
  </main>;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return <main className="page-wrap"><PageHeading eyebrow="YOUR LITTLE FINDS" title="Your bag" text="All the lovely things you picked out, together in one place." />{cart.length ? <div className="cart-layout"><section className="cart-items">{cart.map((item) => <article className="cart-item" key={item.id}><div className={`cart-thumb ${item.color}`}>{item.emoji}</div><div className="cart-item-copy"><a href={`/product/${item.id}`} onClick={link(`/product/${item.id}`)}><h3>{item.name}</h3></a><p>Made by {item.maker}</p><span>{money(item.price)}</span></div><div className="quantity-control"><button onClick={() => updateQuantity(item.id, item.quantity - 1)} aria-label={`Remove one ${item.name}`}>−</button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, item.quantity + 1)} aria-label={`Add one ${item.name}`}>＋</button></div><strong>{money(item.price * item.quantity)}</strong><button className="remove-button" onClick={() => updateQuantity(item.id, 0)} aria-label={`Remove ${item.name}`}>×</button></article>)}</section><OrderSummary subtotal={subtotal} link={link} /></div> : <EmptyState title="Your bag is waiting for a little magic" text="Browse the shop and find something lovely made just for you." action="Explore the shop" href="/shop" link={link} />}</main>;
}

function OrderSummary({ subtotal, link, checkout = false, onCheckout, disabled = false, shippingAmount, actionLabel }) {
  const shipping = shippingAmount ?? (subtotal >= 999 || subtotal === 0 ? 0 : 60);
  return <aside className="summary-card"><h2>A little summary</h2><div><span>Subtotal</span><span>{money(subtotal)}</span></div><div><span>Shipping</span><span>{shipping ? money(shipping) : "On us ♡"}</span></div><div className="summary-total"><strong>Total</strong><strong>{money(subtotal + shipping)}</strong></div><p>Shipping is on us for orders over ₹999.</p>{checkout ? <button className="button button-primary full-button" onClick={onCheckout} disabled={disabled}>{disabled ? "Preparing secure checkout…" : actionLabel || (subtotal > 0 && shippingAmount !== undefined ? "Pay now with Razorpay ↗" : "Review secure payment")}</button> : <a href="/checkout" onClick={link("/checkout")} className="button button-primary full-button">Continue to checkout ↗</a>}<a href="/shop" onClick={link("/shop")} className="summary-back">Keep browsing</a></aside>;
}

let razorpayScriptPromise;

const loadRazorpayCheckout = () => {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        razorpayScriptPromise = null;
        reject(new Error("Could not load Razorpay Checkout. Check your connection and try again."));
      };
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
};

function CheckoutPage({ cart, setCart, link, navigate, setOrders, authUser, authToken, setAuthUser, directOrder, setDirectOrder }) {
  const [customer, setCustomer] = useState(() => ({
    name: authUser?.name || "",
    email: authUser?.email || "",
    phone: authUser?.phone || "",
    address: authUser?.address || "",
    city: authUser?.city || "",
    pin: authUser?.pin || "",
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentSession, setPaymentSession] = useState(null);
  const [unverifiedPayment, setUnverifiedPayment] = useState(null);
  const items = directOrder || cart;
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const checkoutFingerprint = JSON.stringify(
    items.map((item) => [Number(item.id), item.quantity]).sort((a, b) => a[0] - b[0])
  );
  const requestKey = useRef(null);
  const ensureRequestKey = () => {
    if (requestKey.current?.fingerprint === checkoutFingerprint) return requestKey.current.key;
    let savedRequest;
    try {
      savedRequest = JSON.parse(sessionStorage.getItem("vibe-checkout-request"));
    } catch {
      savedRequest = null;
    }
    const newKey = window.crypto?.randomUUID?.()
      || `vibe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const key = savedRequest?.fingerprint === checkoutFingerprint ? savedRequest.key : newKey;
    requestKey.current = { fingerprint: checkoutFingerprint, key };
    try {
      sessionStorage.setItem("vibe-checkout-request", JSON.stringify({
        fingerprint: checkoutFingerprint,
        key,
      }));
    } catch {
      // Checkout remains available when browser storage is disabled.
    }
    return key;
  };

  const completeOrder = (result) => {
    const order = {
      id: `VB-${result.order.id}`,
      ...customer,
      items,
      total: result.order.total,
      date: result.order.createdAt || new Date().toISOString(),
      status: "Order received",
    };
    setOrders((current) => [order, ...current]);
    localStorage.setItem("vibe-last-order", JSON.stringify(order));
    if (!directOrder) setCart([]);
    setDirectOrder(null);
    localStorage.removeItem("vibe-checkout-intent");
    try {
      sessionStorage.removeItem("vibe-checkout-request");
    } catch {
      requestKey.current = null;
    }
    setUnverifiedPayment(null);
    navigate("/confirmation");
  };

  const preparePayment = async () => {
    if (!customer.name || !customer.email || !customer.address || !customer.city || !customer.pin) {
      setError("Please fill in your name, email, delivery address, city, and PIN code.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await apiFetch("http://localhost:5000/api/auth/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(customer),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not save your delivery details.");
      const updatedUser = result.user;
      localStorage.setItem("vibe-user", JSON.stringify(updatedUser));
      setAuthUser(updatedUser);
      const orderResponse = await apiFetch("http://localhost:5000/api/payment/create-order", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": ensureRequestKey(),
        },
        body: JSON.stringify({
          items: items.map((item) => ({ productId: Number(item.id), quantity: item.quantity })),
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          pin: customer.pin,
        }),
      });
      const orderDetails = await readApiResponse(orderResponse);
      if (!orderResponse.ok) throw new Error(orderDetails.message || "Could not prepare secure checkout.");
      if (orderDetails.status === "paid") {
        completeOrder({
          order: {
            id: orderDetails.orderId,
            total: orderDetails.total,
            createdAt: orderDetails.createdAt,
          },
        });
        return;
      }
      setPaymentSession(orderDetails);
    } catch (requestError) {
      if (requestError.message.includes("already been used")
        || requestError.message.includes("different order details")
        || requestError.message.includes("expired")) {
        const key = window.crypto?.randomUUID?.()
          || `vibe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        requestKey.current = { fingerprint: checkoutFingerprint, key };
        try {
          sessionStorage.setItem("vibe-checkout-request", JSON.stringify({
            fingerprint: checkoutFingerprint,
            key,
          }));
        } catch {
          // The next attempt will still use this page's in-memory key.
        }
      }
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const verifyPayment = async (paymentResult) => {
    setPaying(true);
    try {
      const response = await apiFetch("http://localhost:5000/api/payment/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId: paymentSession.orderId, ...paymentResult }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "We could not verify your payment.");

      completeOrder(result);
    } catch (verificationError) {
      if (verificationError.message.includes("expired")) {
        setPaymentSession(null);
        setUnverifiedPayment(null);
        requestKey.current = null;
        try {
          sessionStorage.removeItem("vibe-checkout-request");
        } catch {
          requestKey.current = null;
        }
      } else {
        setUnverifiedPayment(paymentResult);
      }
      setError(verificationError.message === "Failed to fetch"
        ? "Could not verify the payment because the VIBE server is unavailable. Your order has not been confirmed. Retry verification before paying again."
        : verificationError.message);
    } finally {
      setPaying(false);
    }
  };

  const payNow = async () => {
    if (!paymentSession || paying) return;
    setError("");
    if (unverifiedPayment) {
      await verifyPayment(unverifiedPayment);
      return;
    }
    setPaying(true);
    try {
      await loadRazorpayCheckout();
      const checkout = new window.Razorpay({
        key: paymentSession.keyId,
        amount: paymentSession.amount,
        currency: paymentSession.currency,
        name: "VIBE",
        description: "Handmade with heart",
        order_id: paymentSession.razorpayOrderId,
        prefill: { name: customer.name, email: customer.email, contact: customer.phone },
        theme: { color: "#8DA28A" },
        modal: {
          ondismiss: () => {
            setPaying(false);
            setError("Checkout was closed before payment completed. You can try again while this order is reserved.");
          },
        },
        handler: (paymentResult) => {
          setUnverifiedPayment(paymentResult);
          void verifyPayment(paymentResult);
        },
      });
      checkout.on("payment.failed", (failure) => {
        setPaying(false);
        setError(failure.error?.description || "Payment was not completed. You can try again before this order expires.");
      });
      checkout.open();
    } catch (checkoutError) {
      setError(checkoutError.message);
      setPaying(false);
    }
  };

  if (!items.length) return <main className="page-wrap"><EmptyState title="Your bag is empty" text="Add something lovely before you check out." action="Explore the shop" href="/shop" link={link} /></main>;
  if (authUser?.role !== "customer") {
    return <main className="page-wrap narrow-wrap"><PageHeading eyebrow="CHECKOUT" title="A customer account is needed" text="Sign in or create a customer account to continue. Your delivery details will be ready next time." /><div className="auth-choice"><button className="button button-primary" onClick={() => { localStorage.setItem("vibe-checkout-intent", "true"); navigate("/customer/login"); }}>Log in as a customer</button><button className="button button-outline" onClick={() => { localStorage.setItem("vibe-checkout-intent", "true"); navigate("/customer/register"); }}>Create a customer account</button></div></main>;
  }
  const summarySubtotal = paymentSession ? paymentSession.subtotal / 100 : subtotal;
  const summaryShipping = paymentSession ? paymentSession.shipping / 100 : undefined;
  return <main className="page-wrap"><a href="/cart" onClick={link("/cart")} className="back-link">← Back to your bag</a><PageHeading eyebrow="ALMOST YOURS" title="A few delivery details" text="Where should your handmade treasures find their new home?" /><div className="cart-layout"><section><div className="paper-card checkout-card"><Notice message={error} tone="error" /><Field label="Full name" required><input required disabled={Boolean(paymentSession)} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Your name" /></Field><div className="form-row"><Field label="Email address" required><input required type="email" value={customer.email} readOnly /></Field><Field label="Phone number"><input type="tel" disabled={Boolean(paymentSession)} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Optional" /></Field></div><Field label="Delivery address" required><textarea required disabled={Boolean(paymentSession)} rows="3" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="House number, street, and area" /></Field><div className="form-row"><Field label="City" required><input required disabled={Boolean(paymentSession)} value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} placeholder="Your city" /></Field><Field label="PIN code" required><input required disabled={Boolean(paymentSession)} inputMode="numeric" value={customer.pin} onChange={(e) => setCustomer({ ...customer, pin: e.target.value })} placeholder="6-digit PIN" /></Field></div><div className="payment-note">{paymentSession ? "Your order total is confirmed. Stock is reserved for 15 minutes while you complete secure payment." : "Your delivery details are saved to your customer account. Payment is securely handled by Razorpay."}</div></div></section><OrderSummary subtotal={summarySubtotal} link={link} shippingAmount={summaryShipping} checkout onCheckout={paymentSession ? payNow : preparePayment} disabled={saving || paying} actionLabel={unverifiedPayment ? "Retry payment verification" : undefined} /></div>{saving && <p role="status">Preparing your secure order…</p>}{paying && <p role="status">Waiting for payment confirmation…</p>}</main>;
}

function ConfirmationPage({ link }) {
  const order = readStorage("vibe-last-order", null);
  return <main className="page-wrap narrow-wrap"><div className="confirmation-card"><span className="confirmation-icon">✿</span><span className="eyebrow">A LITTLE JOY IS ON ITS WAY</span><h1>Thank you, {order?.name?.split(" ")[0] || "friend"}!</h1><p>Your order is tucked in safely. The maker will start getting it ready soon.</p>{order && <div className="order-number"><span>Order number</span><strong>{order.id}</strong></div>}<div className="hero-actions centered"><a href="/orders" onClick={link("/orders")} className="button button-primary">View your orders ↗</a><a href="/shop" onClick={link("/shop")} className="button button-outline">Back to the shop</a></div></div></main>;
}

function TrackingPage({ orders, link }) {
  const order = orders[0] || readStorage("vibe-last-order", null);
  return <main className="page-wrap narrow-wrap"><PageHeading eyebrow="A LITTLE UPDATE" title="Order tracking" text="Follow your happy mail from the maker’s table to your doorstep." />{order ? <section className="paper-card tracking-card"><div className="tracking-heading"><div><span className="product-category">ORDER NUMBER</span><h2>{order.id}</h2></div><span className="status-pill">{order.status || "Order received"}</span></div><div className="tracking-steps">{["Order received", "Being made ready", "On its way", "At your door"].map((step, index) => <div className={`tracking-step ${index === 0 ? "complete" : ""}`} key={step}><span>{index === 0 ? "✓" : index + 1}</span><div><strong>{step}</strong><p>{index === 0 ? "The maker has your order." : "We’ll update this as your order moves along."}</p></div></div>)}</div><p className="form-hint">This demo keeps order tracking on this device. Your maker will share shipping updates soon.</p></section> : <EmptyState title="No orders to track just yet" text="Your next favourite handmade thing is just around the corner." action="Find a treasure" href="/shop" link={link} />}</main>;
}

function CustomerAccountPage({ authUser, authToken, setAuthUser, accountSessions, setAccountSessions, navigate }) {
  const [profile, setProfile] = useState({
    name: authUser?.name || "",
    phone: authUser?.phone || "",
    address: authUser?.address || "",
    city: authUser?.city || "",
    pin: authUser?.pin || "",
    profileImage: authUser?.profileImage || "",
  });
  const [loading, setLoading] = useState(Boolean(authUser?.role === "customer" && authToken));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (authUser?.role !== "customer" || !authToken) {
      return undefined;
    }
    let active = true;
    const loadProfile = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/auth/profile", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load your account details.");
        if (active) {
          const user = result.user;
          setProfile({
            name: user.name || "",
            phone: user.phone || "",
            address: user.address || "",
            city: user.city || "",
            pin: user.pin || "",
            profileImage: user.profileImage || "",
          });
          setAuthUser(user);
          localStorage.setItem("vibe-user", JSON.stringify(user));
          setAccountSessions(refreshRememberedAccount(user));
        }
      } catch (requestError) {
        if (active) setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadProfile();
    return () => { active = false; };
  }, [authToken, authUser?.role, setAccountSessions, setAuthUser]);

  const uploadAvatar = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP profile image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile images must be 5 MB or smaller.");
      return;
    }

    setError("");
    setNotice("");
    setUploading(true);
    try {
      const result = await uploadImage(file, "customerAvatar", authToken);
      setProfile((current) => ({ ...current, profileImage: result.image.url }));
      setNotice("Profile image uploaded. Save your profile to keep this change.");
    } catch (uploadError) {
      setError(uploadError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await apiFetch("http://localhost:5000/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(profile),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not save your account details.");
      const user = result.user;
      setProfile({
        name: user.name || "",
        phone: user.phone || "",
        address: user.address || "",
        city: user.city || "",
        pin: user.pin || "",
        profileImage: user.profileImage || "",
      });
      setAuthUser(user);
      localStorage.setItem("vibe-user", JSON.stringify(user));
      const updatedSessions = accountSessions.map((session) => (
        String(session.user?.id) === String(user.id) ? { ...session, user } : session
      ));
      setAccountSessions(updatedSessions);
      localStorage.setItem("vibe-accounts", JSON.stringify(updatedSessions));
      setNotice("Your account details have been saved.");
    } catch (saveError) {
      setError(saveError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : saveError.message);
    } finally {
      setSaving(false);
    }
  };

  if (authUser?.role !== "customer") return <main className="page-wrap narrow-wrap">
    <PageHeading eyebrow="YOUR LITTLE ACCOUNT" title="Account details" text="Sign in to view and update your profile, delivery details, and profile picture." />
    <section className="dashboard-card order-login-prompt"><button className="button button-primary" onClick={() => {
      sessionStorage.setItem("vibe-customer-return-path", "/account");
      navigate("/customer/login");
    }}>Customer log in ↗</button></section>
  </main>;
  if (loading) return <main className="page-wrap"><p role="status">Loading your account details…</p></main>;
  return <main className="page-wrap">
    <PageHeading eyebrow="YOUR LITTLE ACCOUNT" title="Account details" text="Keep your contact and delivery details up to date, and add a profile picture that feels like you." />
    <section className="dashboard-card form-card customer-profile-card">
      <Notice message={error} tone="error" />
      <Notice message={notice} />
      <form onSubmit={saveProfile}>
        <div className="customer-profile-photo">
          {profile.profileImage
            ? <img src={profile.profileImage} alt="Your profile" />
            : <span aria-hidden="true">{profile.name.charAt(0).toUpperCase() || "♡"}</span>}
          <div><strong>Your profile picture</strong><small>JPG, PNG, or WebP · 5 MB max</small><label className="image-picker">{uploading ? "Uploading…" : profile.profileImage ? "Change picture" : "Upload a picture"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || saving} onChange={uploadAvatar} /></label></div>
        </div>
        <div className="customer-profile-grid">
          <Field label="Name" required><input required name="name" maxLength={100} value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} autoComplete="name" /></Field>
          <Field label="Email address" required><input type="email" value={authUser.email || ""} readOnly aria-describedby="profile-email-note" /></Field>
          <small id="profile-email-note" className="profile-email-note">This email is used to sign in and cannot be changed here.</small>
          <Field label="Phone number"><input name="phone" type="tel" maxLength={20} value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} autoComplete="tel" /></Field>
          <Field label="Delivery address" required><textarea required name="address" rows={3} maxLength={1000} value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} autoComplete="street-address" /></Field>
          <div className="form-row"><Field label="City" required><input required name="city" maxLength={100} value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} autoComplete="address-level2" /></Field><Field label="PIN code" required><input required name="pin" maxLength={20} value={profile.pin} onChange={(event) => setProfile((current) => ({ ...current, pin: event.target.value }))} autoComplete="postal-code" /></Field></div>
        </div>
        <div className="form-actions"><button type="submit" className="button button-primary" disabled={saving || uploading}>{saving ? "Saving details…" : "Save account details ♡"}</button><button type="button" className="button button-outline" onClick={() => navigate("/orders")}>View my orders</button></div>
      </form>
    </section>
  </main>;
}

function CustomerOrdersPage({ navigate, authUser, authToken }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(Boolean(authToken && authUser?.role === "customer"));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!authToken || authUser?.role !== "customer") return;
    const loadOrders = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/orders/mine", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load your orders.");
        setOrders(result.orders);
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, [authToken, authUser?.role]);

  return <main className="page-wrap">
    <PageHeading eyebrow="A LITTLE UPDATE" title="Your orders" text="Keep up with your happy mail, from the maker’s table to your doorstep." />
    {authUser?.role !== "customer" ? <section className="dashboard-card order-login-prompt"><h2>Log in to see your orders</h2><p>Your order history is private to your customer account.</p><button className="button button-primary" onClick={() => { sessionStorage.setItem("vibe-customer-return-path", "/orders"); navigate("/customer/login"); }}>Customer log in ↗</button></section>
      : loading ? <p role="status">Loading your orders…</p>
        : error ? <Notice message={error} tone="error" />
          : orders.length === 0 ? <EmptyState title="Your order is empty" text="Once you place an order, your creations and their delivery updates will appear here." action="Find a treasure" href="/shop" link={(to) => (event) => { event.preventDefault(); navigate(to); }} />
            : <div className="customer-order-list">{orders.map((order) => {
              const firstItem = order.items[0];
              return <button className="customer-order-card" key={order.id} onClick={() => navigate(`/orders/${order.id}`)}>
                {firstItem?.image ? <img src={firstItem.image} alt="" /> : <span className="customer-order-placeholder">✿</span>}
                <span className="customer-order-copy"><strong>{firstItem?.name || "Your order"}{order.items.length > 1 ? ` + ${order.items.length - 1} more` : ""}</strong><span>Order #{order.id} · {new Date(order.created_at).toLocaleDateString()}</span><span>{order.shop_name}</span></span>
                <span className="customer-order-state"><span className="status-pill">{order.status}</span><strong>{money(order.total_amount)}</strong></span>
              </button>;
            })}</div>}
  </main>;
}

function CustomerOrderDetails({ orderId, authUser, authToken, navigate }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(Boolean(authToken && authUser?.role === "customer"));
  const [error, setError] = useState("");
  const [reason, setReason] = useState("damaged");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [refundError, setRefundError] = useState("");
  useEffect(() => {
    if (!authToken || authUser?.role !== "customer") return;
    const loadOrder = async () => {
      try {
        const response = await apiFetch(`http://localhost:5000/api/orders/mine/${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load this order.");
        setOrder(result.order);
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadOrder();
  }, [authToken, authUser?.role, orderId]);

  const submitRefund = async (event) => {
    event.preventDefault();
    setSaving(true);
    setRefundError("");
    try {
      const response = await apiFetch("http://localhost:5000/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ orderId: order.id, reason, details }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not submit your refund request.");
      setOrder((current) => ({
        ...current,
        refund_request_id: result.refund.id,
        refund_reason: result.refund.reason,
        refund_details: result.refund.details,
        refund_status: result.refund.status,
        refund_provider_status: result.refund.provider_status,
        rejection_reason: result.refund.rejection_reason,
      }));
    } catch (requestError) {
      setRefundError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSaving(false);
    }
  };

  if (authUser?.role !== "customer") return <main className="page-wrap narrow-wrap"><section className="dashboard-card order-login-prompt"><h2>Log in to view this order</h2><button className="button button-primary" onClick={() => { sessionStorage.setItem("vibe-customer-return-path", `/orders/${orderId}`); navigate("/customer/login"); }}>Customer log in ↗</button></section></main>;
  if (loading) return <main className="page-wrap"><p role="status">Loading your order…</p></main>;
  if (error) return <main className="page-wrap"><Notice message={error} tone="error" /></main>;
  if (!order) return <main className="page-wrap"><EmptyState title="Order not found" text="This order could not be found on your account." action="Back to your orders" href="/orders" link={(to) => (event) => { event.preventDefault(); navigate(to); }} /></main>;

  const refundLabels = {
    not_started: "Refund has not been sent to Razorpay.",
    processing: "Refund is being submitted securely to Razorpay.",
    pending: "Razorpay is processing the refund. It can take a few business days.",
    processed: "Razorpay reports that the refund has been processed.",
    failed: "Razorpay could not complete the refund. Please contact the seller.",
    needs_review: "The seller is checking the refund with Razorpay. Please do not submit another request.",
  };
  return <main className="page-wrap">
    <button className="text-button customer-back-link" onClick={() => navigate("/orders")}>← All orders</button>
    <PageHeading eyebrow={`ORDER #${order.id}`} title="Your happy mail" text={`Placed ${new Date(order.created_at).toLocaleString()} · ${order.shop_name}`} />
    <div className="dashboard-columns customer-order-detail-grid">
      <section className="dashboard-card">
        <div className="card-heading"><div><h2>Order status</h2><p>We’ll keep this updated as your order moves along.</p></div><span className="status-pill">{order.status}</span></div>
        {order.items.map((item, index) => <div className="order-item-review-wrap" key={`${item.productId}-${index}`}>
          <div className="order-detail-product">
            {item.image ? <img className="order-product-image" src={item.image} alt="" /> : <span className="order-product-icon">✿</span>}
            <div><strong>{item.name} × {item.quantity}</strong><p>{money(item.price)} each</p></div><strong>{money(Number(item.price) * Number(item.quantity))}</strong>
          </div>
          {order.status === "delivered" && item.productId && <ReviewForm
            orderId={order.id}
            item={item}
            authToken={authToken}
            onSaved={(review) => setOrder((current) => ({
              ...current,
              items: current.items.map((currentItem, itemIndex) => itemIndex === index
                ? { ...currentItem, reviewId: review.id, reviewRating: review.rating, reviewComment: review.comment, reviewImages: review.images }
                : currentItem)
            }))}
          />}
        </div>)}
        <div className="summary-total"><strong>Total {order.payment_status === "paid" ? "paid" : "due"}</strong><strong>{money(order.total_amount)}</strong></div>
        <h3 className="order-section-title">Deliver to</h3>
        <p className="address-block"><strong>{order.customer_name}</strong><br />{order.shipping_address}<br />{order.shipping_city} {order.shipping_postal_code}<br />{order.customer_email}<br />{order.customer_phone}</p>
      </section>
      {order.status !== "delivered" && <section className="dashboard-card refund-card">
        <h2>Refund</h2>
        {order.refund_request_id ? <>
          <span className="status-pill">{order.refund_status}</span>
          <p>{order.refund_status === "rejected"
            ? `The seller could not approve this request: ${order.rejection_reason || "Please contact the seller."}`
            : refundLabels[order.refund_provider_status] || "Your refund request is with the seller."}</p>
          <p><strong>Reason:</strong> {order.refund_reason?.replaceAll("_", " ")}</p>
          {order.refund_details && <p>{order.refund_details}</p>}
        </> : order.payment_status === "paid" ? <>
          <p>Need help with this order? Send the seller a refund request. Requests are reviewed by the shop and paid refunds are processed through Razorpay.</p>
          <form onSubmit={submitRefund}>
            <Field label="Reason for requesting a refund"><select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="damaged">Item arrived damaged</option><option value="wrong_item">Received the wrong item</option><option value="not_received">Order did not arrive</option><option value="other">Other</option>
            </select></Field>
            <Field label="Details (optional)"><textarea maxLength={1000} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Share anything the seller should know." /></Field>
            <Notice message={refundError} tone="error" />
            <button className="button button-primary full-button" disabled={saving}>{saving ? "Sending request…" : "Request a refund"}</button>
          </form>
        </> : <p>A refund request becomes available after your payment is confirmed.</p>}
      </section>}
    </div>
  </main>;
}

function ReviewForm({ orderId, item, authToken, onSaved }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(item.reviewId));
  const [uploading, setUploading] = useState(false);

  const uploadImages = async (event) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = "";
    setError("");
    if (images.length + files.length > 4) {
      setError("Choose up to four review images.");
      return;
    }
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const result = await uploadImage(file, "review", authToken);
        uploaded.push(result.image.url);
      }
      setImages((current) => [...current, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("http://localhost:5000/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          orderId, productId: item.productId, rating, comment, images,
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not save your review.");
      setSaved(true);
      onSaved(result.review);
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSaving(false);
    }
  };

  if (saved) return <div className="saved-review">
    <span className="review-stars" aria-label={`${item.reviewRating || rating} out of 5 stars`}>{"★".repeat(item.reviewRating || rating)}{"☆".repeat(5 - (item.reviewRating || rating))}</span>
    <p>{item.reviewComment || comment || "Thanks for sharing your rating!"}</p>
    {item.reviewImages?.length > 0 && <div className="review-images">{item.reviewImages.map((image, index) => <img key={image} src={image} alt={`Your review image ${index + 1}`} />)}</div>}
  </div>;

  return <form className="review-form" onSubmit={submitReview}>
    <h3>How did you like it?</h3>
    <div className="star-rating-picker" role="radiogroup" aria-label="Rate this product from one to five stars">
      {[1, 2, 3, 4, 5].map((value) => <button type="button" role="radio" aria-checked={rating === value} aria-label={`${value} star${value === 1 ? "" : "s"}`} className={value <= rating ? "selected" : ""} key={value} onClick={() => setRating(value)}>★</button>)}
    </div>
    <Field label="Your review"><textarea rows={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Share a little note about your experience." /></Field>
    <Field label="Photos (up to 4)"><label className="image-picker">{uploading ? "Uploading…" : "＋ Add photos"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || images.length >= 4} onChange={uploadImages} /></label></Field>
    {images.length > 0 && <div className="image-preview-list">{images.map((image, index) => <div key={image}><img src={image} alt={`Review photo ${index + 1}`} /><button type="button" className="remove-button" onClick={() => setImages((current) => current.filter((itemUrl) => itemUrl !== image))} aria-label={`Remove review image ${index + 1}`}>×</button></div>)}</div>}
    <Notice message={error} tone="error" />
    <button className="button button-outline" disabled={saving || uploading}>{saving ? "Saving review…" : "Post review"}</button>
  </form>;
}

function AuthPage({ path, navigate, setAuthUser, setAuthToken, setAccountSessions, notice }) {
  const isCustomer = path.startsWith("/customer/");
  const isRegister = path === "/customer/register";
  const isSellerInvite = path === "/seller/register";
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await apiFetch(isRegister ? "http://localhost:5000/api/auth/customer/register" : "http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "We couldn’t complete that request.");
      if ((isCustomer && result.user.role !== "customer") || (!isCustomer && !["seller", "admin"].includes(result.user.role))) {
        throw new Error(isCustomer ? "Please use a customer account to continue." : "This is a customer account. Use customer login instead.");
      }
      localStorage.setItem("vibe-user", JSON.stringify(result.user));
      localStorage.setItem("vibe-token", result.token);
      setAccountSessions(rememberAccount(result.user, result.token));
      setAuthUser(result.user);
      setAuthToken(result.token);
      if (isCustomer) {
        const checkoutIntent = localStorage.getItem("vibe-checkout-intent") === "true";
        const returnPath = sessionStorage.getItem("vibe-customer-return-path");
        localStorage.removeItem("vibe-checkout-intent");
        sessionStorage.removeItem("vibe-customer-return-path");
        navigate(checkoutIntent ? "/checkout"
          : returnPath?.startsWith("/orders")
            || returnPath?.startsWith("/custom-orders")
            || returnPath?.startsWith("/product/")
            || returnPath?.startsWith("/shops/")
            || returnPath === "/account"
            ? returnPath
            : "/");
      } else {
        navigate("/seller/dashboard");
      }
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "We couldn’t reach the VIBE server. Please make sure the backend is running and try again."
        : requestError.message);
    } finally {
      setLoading(false);
    }
  };
  return <main className="auth-layout"><a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }} className="logo auth-logo">VIBE<span className="logo-heart">♡</span></a><section className="auth-card">
    {isSellerInvite ? <>
      <span className="eyebrow">A COMMUNITY OF INVITED MAKERS</span>
      <h1>Join VIBE as a seller.</h1>
      <p>Seller accounts are created by the VIBE admin. If you’ve been invited, use the email and password they shared to log in.</p>
      <button className="button button-primary full-button" onClick={() => navigate("/seller/login")}>Go to seller login ↗</button>
    </> : <>
      <span className="eyebrow">{isCustomer ? "A LITTLE ACCOUNT FOR YOUR ORDERS" : "WELCOME BACK, MAKER"}</span>
      <h1>{isRegister ? "Join VIBE as a customer." : isCustomer ? "Welcome back." : "Come on in."}</h1>
      <p>{isCustomer ? "Sign in or create a customer account to check out and save your delivery details." : "Your creative corner is right where you left it."}</p>
      <Notice message={notice} tone="error" />
      <Notice message={error} tone="error" />
      <form onSubmit={submit}>
        {isRegister && <Field label="Your name" required><input required maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" autoComplete="name" /></Field>}
        <Field label="Email address" required><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" autoComplete="email" /></Field>
        <Field label="Password" required><div className="password-input-wrap"><input required minLength={isRegister ? 8 : undefined} type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={isRegister ? "At least 8 characters" : "Your password"} autoComplete={isRegister ? "new-password" : "current-password"} /><button type="button" className="password-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m4 4 16 16" />}</svg></button></div></Field>
        <button className="button button-primary full-button" disabled={loading}>{loading ? "One little moment…" : isRegister ? "Create customer account ♡" : isCustomer ? "Log in as customer ↗" : "Log in to my shop ↗"}</button>
      </form>
      {isCustomer ? <><p className="auth-switch">{isRegister ? "Already have an account?" : "New to VIBE?"} <a href={isRegister ? "/customer/login" : "/customer/register"} onClick={(event) => { event.preventDefault(); navigate(isRegister ? "/customer/login" : "/customer/register"); }}>{isRegister ? "Log in" : "Create a customer account"}</a></p><p className="auth-switch">Are you a seller? <a href="/seller/login" onClick={(event) => { event.preventDefault(); navigate("/seller/login"); }}>Seller login</a></p></> : <p className="auth-switch">Shopping with VIBE? <a href="/customer/login" onClick={(event) => { event.preventDefault(); navigate("/customer/login"); }}>Customer login</a></p>}
    </>}
    <a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }} className="back-link">← Back to VIBE</a>
  </section></main>;
}

function DashboardShell({ path, link, navigate, darkMode, setDarkMode, authUser, setAuthUser, authToken, setAuthToken, accountSessions, setAccountSessions }) {
  const page = dashboardPages[path] || (path.startsWith("/seller/orders/")
    ? { title: `Order #${path.slice("/seller/orders/".length)}`, eyebrow: "ORDER DETAILS", description: "A little more about this lovely order." }
    : path.startsWith("/seller/custom-order-details/")
      ? { title: `Custom request #${path.slice("/seller/custom-order-details/".length)}`, eyebrow: "A ONE-OF-A-KIND IDEA", description: "Review the request, set a price, and send the customer your reply." }
      : dashboardPages["/seller/dashboard"]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("vibe-sidebar-collapsed") === "true");
  const content = <DashboardContent {...{ path, navigate, authUser, setAuthUser, authToken }} />;
  const visibleLinks = dashboardLinks.filter((item) => (!item.adminOnly || authUser?.role === "admin")
    && (!item.sellerOnly || authUser?.role === "seller"));
  const toggleSidebar = () => {
    if (window.matchMedia("(max-width: 700px)").matches) {
      setSidebarOpen((open) => !open);
      return;
    }
    setSidebarCollapsed((collapsed) => {
      localStorage.setItem("vibe-sidebar-collapsed", String(!collapsed));
      return !collapsed;
    });
  };
  const collapseSidebar = () => {
    if (window.matchMedia("(max-width: 700px)").matches) {
      setSidebarOpen(false);
      return;
    }
    setSidebarCollapsed(true);
    localStorage.setItem("vibe-sidebar-collapsed", "true");
  };
  const signOut = () => signOutAccount(authUser, accountSessions, setAuthUser, setAuthToken, setAccountSessions, navigate);
  return <div className={`dashboard-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside className={`dashboard-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><a href="/seller/dashboard" onClick={link("/seller/dashboard")} className="logo">VIBE<span className="logo-heart">♡</span></a><button className="sidebar-minimize" onClick={collapseSidebar} aria-label="Minimize sidebar" title="Minimize sidebar">‹</button></div>
      <div className="shop-mini"><span className="shop-mini-avatar">🌷</span><div><strong>{authUser?.name ? `${authUser.name}’s shop` : "Maker workspace"}</strong><span>{authUser?.role === "admin" ? "Administrator" : "Maker workspace"}</span></div><span>⌄</span></div>
      <span className="sidebar-label">YOUR WORKSPACE</span>
      <nav>{visibleLinks.map((item) => <a key={item.path} href={item.path} title={sidebarCollapsed ? item.label : undefined} onClick={link(item.path)} className={(path === item.path || (item.path === "/seller/products" && path === "/seller/products/edit")) ? "active" : ""}><span>{item.icon}</span><span className="sidebar-link-label">{item.label}</span></a>)}</nav>
      <div className="sidebar-bottom"><a href="/" onClick={link("/")}>← <span className="sidebar-link-label">Visit the marketplace</span></a><button onClick={signOut}>↗ <span className="sidebar-link-label">Log out</span></button></div>
    </aside>
    <main className="dashboard-main">
      <header className="dashboard-topbar">
        <button className={`mobile-menu ${sidebarCollapsed ? "sidebar-trigger-visible" : ""}`} onClick={toggleSidebar} aria-label={window.matchMedia("(max-width: 700px)").matches ? "Open navigation menu" : "Expand sidebar"} title={window.matchMedia("(max-width: 700px)").matches ? "Open navigation menu" : "Expand sidebar"}><span /><span /><span /></button>
        <span>Maker workspace <span className="crumb-separator">/</span> {page.title}</span>
        <div><button className="theme-toggle" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle colour theme">{darkMode ? "☼" : "☾"}</button><AccountMenu {...{ authUser, setAuthUser, setAuthToken, accountSessions, setAccountSessions, navigate }} /></div>
      </header>
      <div className="dashboard-content"><div className="dashboard-heading"><div><span className="eyebrow">{page.eyebrow}</span><h1>{page.title}</h1><p>{page.description}</p></div>{path === "/seller/dashboard" && authUser?.role === "seller" && <button className="button button-primary" onClick={() => navigate("/seller/shop-settings")}>Edit storefront</button>}{path === "/seller/products" && <button className="button button-primary" onClick={() => navigate("/seller/products/new")}>＋ Add product</button>}{path === "/seller/refunds" && <button className="button button-outline" onClick={() => navigate("/seller/orders")}>View orders</button>}</div>{content}</div>
    </main>
  </div>;
}

function DashboardContent({ path, navigate, authUser, setAuthUser, authToken }) {
  if (path === "/seller/dashboard") return <OverviewPage key={authUser?.id} navigate={navigate} authToken={authToken} accountId={authUser?.id} />;
  if (path === "/seller/accounts" && authUser?.role === "admin") return <SellerAccountsPage authToken={authToken} />;
  if (path === "/seller/accounts") return <section className="dashboard-card"><h2>Admin access required</h2><p>Only the VIBE admin can create seller accounts.</p></section>;
  if (path === "/seller/shop-settings" && authUser?.role === "seller") return <ShopSettingsPage authToken={authToken} />;
  if (path === "/seller/shop-settings") return <section className="dashboard-card"><h2>Seller access required</h2><p>Shop pages are managed by their seller accounts.</p></section>;
  if (path === "/seller/products") return <ProductManagement navigate={navigate} authToken={authToken} />;
  if (path === "/seller/products/new" || path === "/seller/products/edit") return <ProductForm navigate={navigate} authToken={authToken} authUser={authUser} editing={path.endsWith("/edit")} />;
  if (path === "/seller/inventory") return <InventoryPage authToken={authToken} navigate={navigate} />;
  if (path === "/seller/orders") return <OrdersPage navigate={navigate} authToken={authToken} />;
  if (path.startsWith("/seller/orders/")) return <OrderDetails orderId={path.slice("/seller/orders/".length)} authToken={authToken} />;
  if (path === "/seller/refunds") return <SellerRefundsPage authToken={authToken} />;
  if (path === "/seller/custom-orders") return <SellerCustomOrdersPage navigate={navigate} authToken={authToken} />;
  if (path.startsWith("/seller/custom-order-details/")) return <SellerCustomOrderDetails requestId={path.split("/").pop()} authToken={authToken} />;
  if (path === "/seller/reviews") return <ReviewsPage authToken={authToken} />;
  if (path === "/seller/analytics") return <AnalyticsPage authToken={authToken} />;
  if (path === "/seller/account") return <SettingsPage type="account" authUser={authUser} setAuthUser={setAuthUser} />;
  return <OverviewPage navigate={navigate} />;
}

function useSellerAnalytics(authToken) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const loadAnalytics = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch("http://localhost:5000/api/orders/analytics", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load shop analytics.");
        if (!Array.isArray(result.weeklySales) || !Array.isArray(result.monthlySales)) {
          throw new Error("The VIBE server returned invalid analytics data. Restart the backend and try again.");
        }
        if (active) setAnalytics(result);
      } catch (requestError) {
        if (active) setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadAnalytics();
    return () => { active = false; };
  }, [authToken]);
  return { analytics, loading, error };
}

function SalesBars({ rows, interval }) {
  const highestAmount = Math.max(0, ...rows.map((row) => Math.abs(Number(row.amount) || 0)));
  if (!highestAmount) return <p className="chart-empty">Paid sales will appear here when orders are completed.</p>;
  return <div className={`chart-bars${interval === "month" ? " analytics-bars" : ""}`}>
    {rows.map((row) => {
      const amount = Number(row.amount) || 0;
      const date = new Date(row[interval === "month" ? "month" : "date"]);
      const label = date.toLocaleDateString("en-IN", interval === "month"
        ? { month: "short" }
        : { weekday: "short" });
      return <div className="chart-column" key={row[interval === "month" ? "month" : "date"]}>
        <span className={amount < 0 ? "negative-bar" : ""} title={`${label}: ${money(amount)}`} aria-label={`${label}: ${money(amount)}`} style={{ height: `${amount ? Math.max((Math.abs(amount) / highestAmount) * 100, 2) : 0}%` }} />
        <small>{label}</small>
      </div>;
    })}
  </div>;
}

function AnalyticsStats({ summary }) {
  const demoOrders = Number(summary.demo_orders) || 0;
  const demoRefunds = Number(summary.demo_refunds) || 0;
  const stats = [
    ["Net sales this month", money(summary.month_sales), "Paid orders less processed refunds"],
    ["Orders to pack", Number(summary.orders_to_pack) || 0, "Paid orders awaiting shipment"],
    ["Orders delivered", Number(summary.delivered_orders) || 0, "Paid orders marked delivered"],
    ["Refunds processed", Number(summary.processed_refunds) || 0, demoRefunds
      ? `${demoRefunds} simulated; no provider was contacted`
      : "Confirmed by Razorpay"],
  ];
  return <>{(demoOrders || demoRefunds) > 0 && <p className="form-hint">Includes {demoOrders} simulated demo orders and {demoRefunds} simulated refunds; no real payments were made.</p>}<div className="stats-grid">{stats.map(([label, value, note]) => <article className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div></>;
}

function AnalyticsNotice({ loading, error }) {
  if (loading) return <section className="dashboard-card"><p role="status">Loading shop analytics…</p></section>;
  if (error) return <section className="dashboard-card"><Notice message={error} tone="error" /></section>;
  return null;
}

function OverviewPage({ navigate, authToken, accountId }) {
  const { analytics, loading, error } = useSellerAnalytics(authToken);
  const checklistKey = `vibe-checklist-${accountId}`;
  const [checklist, setChecklist] = useState(() => {
    const saved = readStorage(checklistKey, null);
    return Array.isArray(saved) && saved.every((item) => item && typeof item.title === "string" && typeof item.description === "string" && typeof item.done === "boolean")
      ? saved
      : [
        { id: "first-listing", title: "Make your first listing", description: "Your products are ready to meet the world.", done: true },
        { id: "personalise-shop", title: "Personalise your shop", description: "Add a note about what inspires you.", done: true },
        { id: "share-shop", title: "Share your shop with a friend", description: "Good things are even better together.", done: false },
      ];
  });
  useEffect(() => {
    localStorage.setItem(checklistKey, JSON.stringify(checklist));
  }, [checklist, checklistKey]);
  const updateChecklistItem = (id, changes) => setChecklist((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));

  const weekTotal = (analytics?.weeklySales || []).reduce((total, row) => total + Number(row.amount || 0), 0);
  return <>
    {analytics ? <AnalyticsStats summary={analytics.summary} /> : <AnalyticsNotice loading={loading} error={error} />}
    <div className="dashboard-columns">
      <section className="dashboard-card"><div className="card-heading"><div><h2>Recent orders</h2><p>A little happy mail to get ready</p></div><button className="text-button" onClick={() => navigate("/seller/orders")}>All orders ↗</button></div><OrdersTable compact navigate={navigate} authToken={authToken} /></section>
      <section className="dashboard-card"><div className="card-heading"><div><h2>Your little checklist</h2><p>Edit the notes and tick tasks as you like</p></div></div>
        <ul className="checklist">{checklist.map((item) => <li key={item.id}>
          <input type="checkbox" checked={item.done} aria-label={`Mark ${item.title || "task"} complete`} onChange={(event) => updateChecklistItem(item.id, { done: event.target.checked })} />
          <div><input className="checklist-text-input" maxLength={100} aria-label="Checklist task" value={item.title} onChange={(event) => updateChecklistItem(item.id, { title: event.target.value })} />
            <textarea className="checklist-text-input checklist-description-input" maxLength={240} aria-label="Checklist note" rows={2} value={item.description} onChange={(event) => updateChecklistItem(item.id, { description: event.target.value })} /></div>
        </li>)}</ul>
      </section>
    </div>
    {analytics && <section className="dashboard-card performance-card"><div className="card-heading"><div><h2>Little by little</h2><p>Net sales over the last seven days</p></div><span className="performance-total">{money(weekTotal)} <small>this week</small></span></div><SalesBars rows={analytics.weeklySales} interval="day" /></section>}
  </>;
}

function OrdersTable({ compact = false, navigate, authToken }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const loadOrders = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/orders", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load orders.");
        setOrders(result.orders);
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, [authToken]);
  if (loading) return <p role="status">Loading orders…</p>;
  if (error) return <Notice message={error} tone="error" />;
  if (!orders.length) return <EmptyState title="No orders yet" text="Paid orders will appear here as customers check out." />;
  const visibleOrders = compact ? orders.slice(0, 3) : orders;
  return <div className="table-scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>{visibleOrders.map((order) => <tr key={order.id}>
    <td><button className="table-link" onClick={() => navigate(`/seller/orders/${order.id}`)}>#{order.id}</button></td>
    <td>{order.customer_name || order.customer_email}</td><td>{order.items.map((item) => item.name).join(", ")}</td><td>{money(order.total_amount)}</td>
    <td><span className={`status-pill ${order.status === "delivered" ? "status-done" : ""}`}>{order.status}</span></td>
  </tr>)}</tbody></table></div>;
}

function OrdersPage({ navigate, authToken }) {
  return <section className="dashboard-card"><OrdersTable navigate={navigate} authToken={authToken} /></section>;
}

function OrderDetails({ orderId, authToken }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [updateError, setUpdateError] = useState("");
  useEffect(() => {
    const loadOrder = async () => {
      try {
        const response = await apiFetch(`http://localhost:5000/api/orders/${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load this order.");
        setOrder(result.order);
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadOrder();
  }, [authToken, orderId]);

  const updateStatus = async (event) => {
    const status = event.target.value;
    setSaving(true);
    setUpdateError("");
    try {
      const response = await apiFetch(`http://localhost:5000/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ status }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not update the order.");
      setOrder((current) => ({ ...current, status: result.order.status }));
    } catch (requestError) {
      setUpdateError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <section className="dashboard-card"><p role="status">Loading order…</p></section>;
  if (error) return <section className="dashboard-card"><Notice message={error} tone="error" /></section>;
  if (!order) return <EmptyState title="Order not found" text="This order may not belong to your shop." />;
  const nextStatuses = {
    processing: ["processing", "shipped", "cancelled"],
    shipped: ["shipped", "delivered", "cancelled"],
    delivered: ["delivered"],
    cancelled: ["cancelled"],
  }[order.status] || [order.status];
  return <div className="dashboard-columns">
    <section className="dashboard-card">
      <div className="card-heading"><div><h2>Order summary</h2><p>Placed {new Date(order.created_at).toLocaleString()}</p></div><span className="status-pill">{order.status}</span></div>
      {order.items.map((item, index) => <div className="order-detail-product" key={`${item.productId}-${index}`}>
        {item.image ? <img className="order-product-image" src={item.image} alt="" /> : <span className="order-product-icon">✿</span>}
        <div><strong>{item.name} × {item.quantity}</strong><p>{money(item.price)} each</p></div><strong>{money(Number(item.price) * Number(item.quantity))}</strong>
      </div>)}
      <div className="summary-total"><strong>Total {order.payment_status === "paid" ? "paid" : "due"}</strong><strong>{money(order.total_amount)}</strong></div>
      {order.payment_status === "paid" && <Field label="Update order status"><select className="order-status-select" value={order.status} disabled={saving || nextStatuses.length === 1} onChange={updateStatus}>
        {nextStatuses.map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
      </select></Field>}
      {saving && <p role="status">Saving order status…</p>}<Notice message={updateError} tone="error" />
    </section>
    <section className="dashboard-card"><h2>Deliver to</h2><p className="address-block"><strong>{order.customer_name || "Customer"}</strong><br />{order.shipping_address}<br />{order.shipping_city} {order.shipping_postal_code}<br />{order.customer_email}<br />{order.customer_phone}</p></section>
  </div>;
}

function SellerRefundsPage({ authToken }) {
  const [refunds, setRefunds] = useState([]);
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadRefunds = useCallback(async () => {
    const response = await apiFetch("http://localhost:5000/api/refunds", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Could not load refund requests.");
    if (!Array.isArray(result.refunds)) throw new Error("The VIBE server returned invalid refund data.");
    setRefunds(result.refunds);
    setError("");
  }, [authToken]);
  const refreshRefunds = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadRefunds();
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setLoading(false);
    }
  }, [loadRefunds]);
  useEffect(() => {
    let active = true;
    const fetchRefunds = async () => {
      try {
        await loadRefunds();
      } catch (requestError) {
        if (active) setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchRefunds();
    return () => { active = false; };
  }, [loadRefunds]);

  const decide = async (refund, decision) => {
    setSavingId(refund.id);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`http://localhost:5000/api/refunds/${refund.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          decision,
          rejectionReason: rejectionReasons[refund.id] || "",
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not update the refund request.");
      setNotice(decision === "approve"
        ? "The request was approved. Razorpay refund progress is shown below."
        : "The refund request was declined.");
      await loadRefunds();
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <section className="dashboard-card"><p role="status">Loading refund requests…</p></section>;
  if (error && !refunds.length) return <section className="dashboard-card">
    <Notice message={error} tone="error" />
    <button className="button button-outline" type="button" onClick={refreshRefunds}>Try loading again</button>
  </section>;
  return <div className="refund-list">
    <Notice message={error} tone="error" /><Notice message={notice} />
    {!refunds.length ? <EmptyState title="No refund requests" text="Refund requests appear here after a customer requests one for an eligible paid order." /> : refunds.map((refund) => (
      <section className="dashboard-card refund-request-card" key={refund.id}>
        <div className="card-heading"><div><h2>Order #{refund.order_id}</h2><p>{refund.customer_name || refund.customer_email} · {new Date(refund.requested_at).toLocaleString()}</p></div><span className={`status-pill ${refund.provider_status === "processed" ? "status-done" : ""}`}>{refund.status === "requested" ? "Request pending" : refund.provider_status.replaceAll("_", " ")}</span></div>
        <div className="refund-order-products">{refund.items.map((item, index) => <div className="refund-order-product" key={`${item.name}-${index}`}>
          {item.image ? <img src={item.image} alt="" /> : <span className="order-product-icon">✿</span>}
          <span>{item.name} × {item.quantity}</span>
        </div>)}</div>
        <p><strong>Reason:</strong> {refund.reason.replaceAll("_", " ")}</p>
        {refund.details && <p>{refund.details}</p>}
        <p><strong>Total:</strong> {money(refund.total_amount)}</p>
        {refund.status === "requested" && <div className="refund-actions">
          <label className="field"><span>Reason if declining</span><input value={rejectionReasons[refund.id] || ""} onChange={(event) => setRejectionReasons((current) => ({ ...current, [refund.id]: event.target.value }))} maxLength={500} placeholder="Required only to decline" /></label>
          <div><button className="button button-outline" disabled={savingId === refund.id || !rejectionReasons[refund.id]?.trim()} onClick={() => decide(refund, "reject")}>Decline</button><button className="button button-primary" disabled={savingId === refund.id} onClick={() => decide(refund, "approve")}>{savingId === refund.id ? "Processing…" : "Approve full refund"}</button></div>
        </div>}
        {refund.status === "approved" && <p className="form-hint">{refund.details?.startsWith("[DEMO]")
          ? "Simulated demo refund only; no payment provider was contacted."
          : refund.provider_status === "processed"
            ? "Razorpay confirms this refund has been processed."
            : refund.provider_status === "failed" || refund.provider_status === "needs_review"
              ? `Refund needs attention: ${refund.provider_error || "Check the Razorpay dashboard. Do not submit another refund."}`
              : "The request is approved, but the refund is not complete until Razorpay confirms it."}</p>}
        {refund.status === "rejected" && <p><strong>Declined:</strong> {refund.rejection_reason}</p>}
      </section>
    ))}
  </div>;
}

function ProductManagement({ navigate, authToken }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/products", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load products.");
        setItems(result.products);
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, [authToken]);

  return <section className="dashboard-card">
    {error && <Notice message={error} tone="error" />}
    {loading ? <p>Loading your saved products…</p> : items.length === 0
      ? <EmptyState title="Your product shelf is ready" text="Add your first creation and it will appear here." action="Add a product" onAction={() => navigate("/seller/products/new")} />
    : <div className="table-scroll"><table><thead><tr><th>Product</th><th>Shop</th><th>Category</th><th>Price</th><th>Stock status</th><th>Visibility</th><th>Photos</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
        <td><div className="table-product">{item.image && <img className="table-product-image" src={item.image} alt="" />}<strong>{item.name}</strong></div></td>
        <td>{item.shop_name}</td><td>{item.category}</td><td>{money(item.price)}</td><td><span className={`status-pill ${Number(item.stock) === 0 ? "status-out" : Number(item.stock) < 5 ? "status-low" : "status-live"}`}>{Number(item.stock) === 0 ? "Out of stock" : Number(item.stock) < 5 ? `Low · ${item.stock}` : `In stock · ${item.stock}`}</span></td><td>{item.availability ? "Visible" : "Hidden"}</td><td>{Array.isArray(item.images) ? item.images.length : item.image ? 1 : 0}</td>
      <td><button className="button button-outline product-edit-trigger" type="button" onClick={() => setEditingProduct(item)}>Edit product</button></td>
    </tr>)}</tbody></table></div>}
    {editingProduct && <ProductEditDialog
    product={editingProduct}
    authToken={authToken}
    onClose={() => setEditingProduct(null)}
    onSaved={(updatedProduct) => {
      setItems((current) => current.map((item) => String(item.id) === String(updatedProduct.id)
        ? { ...item, ...updatedProduct, id: String(updatedProduct.id), price: Number(updatedProduct.price), image: updatedProduct.image || "" }
        : item));
      setEditingProduct(null);
    }}
    />}
  </section>;
}

function ProductEditDialog({ product, authToken, onClose, onSaved }) {
  const initialImages = Array.isArray(product.images) && product.images.length
    ? product.images.map((image) => typeof image === "string" ? image : image?.url).filter(Boolean)
    : product.image ? [product.image] : [];
  const [name, setName] = useState(product.name || "");
  const [category, setCategory] = useState(product.category || "");
  const [price, setPrice] = useState(String(product.price ?? ""));
  const [images, setImages] = useState(initialImages);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event) => {
    if (event.key === "Escape" && !saving && !uploading) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving, uploading]);

  const uploadImages = async (event) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    if (images.length + files.length > 5) {
    setError("A product can have up to five photos.");
    return;
    }
    if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
    setError("Choose JPG, PNG, or WebP images no larger than 5 MB each.");
    return;
    }

    setError("");
    setUploading(true);
    try {
    for (const file of files) {
      const result = await uploadImage(file, "product", authToken);
      setImages((current) => [...current, result.image.url]);
    }
    } catch (uploadError) {
    setError(uploadError.message === "Failed to fetch"
      ? "Could not reach the VIBE server. Check that the backend is running."
      : uploadError.message);
    } finally {
    setUploading(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
    const response = await apiFetch(`http://localhost:5000/api/products/${encodeURIComponent(product.id)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, category, price, images }),
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.message || "Could not save product changes.");
    onSaved(result.product);
    } catch (saveError) {
    setError(saveError.message === "Failed to fetch"
      ? "Could not reach the VIBE server. Check that the backend is running."
      : saveError.message);
    } finally {
    setSaving(false);
    }
  };

  return <div className="product-edit-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !saving && !uploading) onClose();
  }}>
    <section className="product-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="product-edit-title">
    <header className="product-edit-heading">
      <div><span className="eyebrow">A LITTLE UPDATE</span><h2 id="product-edit-title">Edit product</h2><p>Update how this creation appears in your shop.</p></div>
      <button type="button" className="product-edit-close" aria-label="Close product editor" disabled={saving || uploading} onClick={onClose}>×</button>
    </header>
    <form onSubmit={save}>
      {error && <Notice message={error} tone="error" />}
      <div className="product-edit-images">
        <div className="product-edit-image-list">
          {images.map((image, index) => <div className="uploaded-photo" key={`${image}-${index}`}>
            <img src={image} alt={`${name || "Product"} photo ${index + 1}`} />
            <button type="button" aria-label={`Remove product photo ${index + 1}`} disabled={saving || uploading} onClick={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>×</button>
          </div>)}
        </div>
        <label className="image-picker">{uploading ? "Uploading…" : "＋ Add photos"}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || saving || images.length >= 5} onChange={uploadImages} />
        </label>
        <small>JPG, PNG, or WebP · Up to 5 photos · 5 MB each</small>
      </div>
      <Field label="Product name" required><input required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Category" required><input required maxLength={80} value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
      <Field label="Price (₹)" required><input required type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></Field>
      <div className="form-actions"><button type="button" className="button button-outline" disabled={saving || uploading} onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving || uploading}>{saving ? "Saving changes…" : "Save product ♡"}</button></div>
    </form>
    </section>
  </div>;
}

function ProductForm({ navigate, authToken, authUser, editing = false }) {
  const [saved, setSaved] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shops, setShops] = useState([]);
  const [shopError, setShopError] = useState("");

  useEffect(() => {
    if (authUser?.role !== "admin") return;
    const loadShops = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/products/shops", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load seller shops.");
        setShops(result.shops);
      } catch (error) {
        setShopError(error.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : error.message);
      }
    };
    loadShops();
  }, [authToken, authUser?.role]);

  const uploadPhotos = async (event) => {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files || []);
    input.value = "";
    setUploadError("");
    if (photos.length + selectedFiles.length > 5) {
      setUploadError("Choose up to five product photos.");
      return;
    }

    setUploading(true);
    try {
      for (const file of selectedFiles) {
        const result = await uploadImage(file, "product", authToken);
        setPhotos((current) => [...current, result.image]);
      }
    } catch (error) {
      setUploadError(error.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : error.message);
    } finally {
      setUploading(false);
    }
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setSaveError("");
    setSaved(false);
    setSaving(true);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("http://localhost:5000/api/products", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.get("name"),
          category: formData.get("category"),
          description: formData.get("description"),
          price: formData.get("price"),
          stock: formData.get("stock"),
          images: photos.map((photo) => photo.url),
          ...(authUser?.role === "admin" ? { shopId: formData.get("shopId") } : {}),
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not save product.");
      setSaved(true);
    } catch (error) {
      setSaveError(error.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running, then try saving again."
        : error.message);
    } finally {
      setSaving(false);
    }
  };

  return <section className="dashboard-card form-card seller-form-card">
    {saved && <Notice message="Product saved to Neon successfully. Your product and Cloudinary image URLs are stored." />}
    {uploadError && <Notice message={uploadError} tone="error" />}
    {saveError && <Notice message={saveError} tone="error" />}
    {shopError && <Notice message={shopError} tone="error" />}
    {authUser?.role === "admin" && shops.length === 0 && !shopError && <Notice message="Create a seller and shop from Seller accounts before adding a product." />}
    <form onSubmit={saveProduct}>
    {authUser?.role === "admin" && <Field label="Seller shop" required><ThemedSelect name="shopId" required defaultValue="" placeholder="Choose a shop" options={shops.map((shop) => ({ label: shop.shop_name, value: shop.id }))} /></Field>}
    <div className={`product-photos${photos.length > 0 ? " has-photos" : ""}`}>
      <div className={`product-upload${photos.length > 0 ? " product-upload-compact" : ""}`}>
        <span>{uploading ? "…" : "＋"}</span>
        <strong>{uploading ? "Uploading your photos…" : editing ? "Update product photos" : "Add product photos"}</strong>
        <small>JPG, PNG, or WebP · Up to 5 images · 5 MB each</small>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || photos.length >= 5} onChange={uploadPhotos} aria-label="Choose product photos" />
      </div>
      {photos.length > 0 && <div className="uploaded-photos">{photos.map((photo) => <div className="uploaded-photo" key={photo.publicId}><img src={photo.url} alt="Uploaded product" /><button type="button" aria-label="Remove photo from this product" onClick={() => setPhotos((current) => current.filter((item) => item.publicId !== photo.publicId))}>×</button></div>)}</div>}
    </div>
    <div className="form-row"><Field label="Product name" required><input name="name" required maxLength="150" defaultValue={editing ? "Pastel Dream Earrings" : ""} placeholder="A lovely name for your creation" /></Field><Field label="Category" required><ThemedSelect name="category" required defaultValue={editing ? "Jewellery" : ""} placeholder="Choose a category" options={["Jewellery", "Art & prints", "Accessories", "Home & living"]} /></Field></div>
    <Field label="A little description"><textarea name="description" rows="4" maxLength="5000" defaultValue={editing ? "Handmade pastel earrings, designed and made with care." : ""} placeholder="What makes this piece special? Tell its story…" /></Field>
    <div className="form-row"><Field label="Price (₹)" required><input name="price" required type="number" min="0.01" step="0.01" defaultValue={editing ? 299 : ""} placeholder="0.00" /></Field><Field label="Stock available" required><input name="stock" required type="number" min="0" step="1" defaultValue={editing ? 8 : 0} placeholder="0" /></Field></div>
    <p className="form-hint">Product details and Cloudinary image URLs will be saved together in Neon. Uploaded photos remain in Cloudinary if you cancel.</p>
    <div className="form-actions"><button type="button" className="button button-outline" disabled={saving} onClick={() => navigate("/seller/products")}>Cancel</button><button type="submit" className="button button-primary" disabled={uploading || saving || (authUser?.role === "admin" && shops.length === 0)}>{saving ? "Saving to Neon…" : saved ? "Saved to Neon ✓" : editing ? "Save changes ♡" : "Save product ♡"}</button></div>
    </form>
  </section>;
}

function SellerAccountsPage({ authToken }) {
  const [form, setForm] = useState({ name: "", shopName: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const createSeller = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const response = await apiFetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(form),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "The seller account could not be created.");
      setMessage(`Seller account created for ${result.user.email}. Share the temporary password with them securely.`);
      setForm({ name: "", shopName: "", email: "", password: "" });
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSaving(false);
    }
  };
  return <section className="dashboard-card form-card seller-form-card">
    <Notice message={error} tone="error" />
    <Notice message={message} />
    <h2>Invite a maker</h2>
    <p>Create a seller login for someone you’ve invited to VIBE. They can use these credentials to access their workspace.</p>
    <form onSubmit={createSeller}>
      <Field label="Seller name" required><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Maker’s name" /></Field>
      <Field label="Shop name" required><input required maxLength="150" value={form.shopName} onChange={(event) => setForm({ ...form, shopName: event.target.value })} placeholder="The name of their shop" /></Field>
      <Field label="Email address" required><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="maker@example.com" /></Field>
      <Field label="Temporary password" required><input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 8 characters" /></Field>
      <button className="button button-primary" disabled={saving}>{saving ? "Creating account…" : "Create seller account ♡"}</button>
    </form>
  </section>;
}

function InventoryPage({ authToken, navigate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/products", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load inventory.");
        if (!Array.isArray(result.products)) throw new Error("The server returned an invalid product list.");
        setItems(result.products.map((item) => ({
          ...item,
          id: String(item.id),
          stock: Number(item.stock),
          availability: item.availability !== false,
          image: item.image || item.images?.[0] || "",
        })));
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, [authToken]);

  const updateItem = (id, changes) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  };

  const saveInventory = async (item) => {
    setError("");
    setNotice("");
    setSavingId(item.id);
    try {
      const response = await apiFetch(`http://localhost:5000/api/products/${encodeURIComponent(item.id)}/inventory`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stock: item.stock, availability: item.availability }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not save inventory.");
      updateItem(item.id, result.product);
      setNotice(`${item.name} inventory updated.`);
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSavingId(null);
    }
  };

  const lowStockCount = items.filter((item) => item.stock > 0 && item.stock < 5).length;
  const outOfStockCount = items.filter((item) => item.stock === 0).length;
  const totalStock = items.reduce((total, item) => total + item.stock, 0);
  return <>
    {error && <Notice message={error} tone="error" />}
    {notice && <Notice message={notice} />}
    <div className="stats-grid inventory-stats"><article className="stat-card"><span>Units in stock</span><strong>{totalStock}</strong><small>across {items.length} products</small></article><article className="stat-card"><span>Running low</span><strong>{String(lowStockCount).padStart(2, "0")}</strong><small>fewer than 5 units</small></article><article className="stat-card"><span>Out of stock</span><strong>{String(outOfStockCount).padStart(2, "0")}</strong><small>currently unavailable to order</small></article></div>
    <section className="dashboard-card">
      {loading ? <p role="status">Loading your inventory…</p> : items.length === 0
        ? <EmptyState title="No products in your inventory yet" text="Products you add will appear here so you can update stock and visibility." action="Add a product" onAction={() => navigate("/seller/products/new")} />
        : <div className="table-scroll"><table><thead><tr><th>Product</th><th>Stock</th><th>Stock status</th><th>Show in shop</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
          <td><div className="table-product">{item.image && <img className="table-product-image" src={item.image} alt="" />}<strong>{item.name}</strong></div></td>
          <td><input className="stock-input" type="number" min="0" step="1" value={item.stock} onChange={(event) => updateItem(item.id, { stock: event.target.value === "" ? 0 : Number(event.target.value) })} aria-label={`Update stock for ${item.name}`} /></td>
          <td><span className={`status-pill ${item.stock === 0 ? "status-out" : item.stock < 5 ? "status-low" : "status-live"}`}>{item.stock === 0 ? "Out of stock" : item.stock < 5 ? "Running low" : "In stock"}</span></td>
          <td><label className="inventory-visibility"><input type="checkbox" checked={item.availability} onChange={(event) => updateItem(item.id, { availability: event.target.checked })} />{item.availability ? "Visible" : "Hidden"}</label></td>
          <td><button className="button button-outline inventory-save" disabled={savingId === item.id} onClick={() => saveInventory(item)}>{savingId === item.id ? "Saving…" : "Save"}</button></td>
        </tr>)}</tbody></table></div>}
    </section>
  </>;
}

function CustomerCustomOrdersPage({ authUser, authToken, navigate }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(Boolean(authToken && authUser?.role === "customer"));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!authToken || authUser?.role !== "customer") return;
    const loadRequests = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/custom-orders/mine", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load your custom requests.");
        setRequests(result.requests);
        const readResponse = await apiFetch("http://localhost:5000/api/custom-orders/mine/read", {
          method: "PATCH",
          headers: { Authorization: "Bearer " + authToken },
        });
        const readResult = await readApiResponse(readResponse);
        if (!readResponse.ok) throw new Error(readResult.message || "Could not mark your messages as read.");
        window.dispatchEvent(new Event("vibe-mail-read"));
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadRequests();
  }, [authToken, authUser?.role]);

  const cancelRequest = async (request) => {
    if (!window.confirm("Cancel this accepted custom order? It will no longer be available to pay.")) return;
    setError("");
    try {
      const response = await apiFetch(`http://localhost:5000/api/custom-orders/${request.id}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not cancel this request.");
      setRequests((current) => current.map((entry) => entry.id === request.id ? { ...entry, ...result.request, quoted_price: null } : entry));
      setNotice("Your accepted custom order was cancelled.");
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    }
  };

  const removeRequest = async (request) => {
    if (!window.confirm("Remove this message from your inbox? The maker will still be able to see the request.")) return;
    setError("");
    try {
      const response = await apiFetch(`http://localhost:5000/api/custom-orders/${request.id}/remove`, {
        method: "PATCH",
        headers: { Authorization: "Bearer " + authToken },
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not remove this message.");
      setRequests((current) => current.filter((entry) => entry.id !== request.id));
      setNotice("The message was removed from your inbox. The maker can still view the request.");
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    }
  };

  return <main className="page-wrap">
    <PageHeading eyebrow="YOUR MAKER MAIL" title="Custom order replies" text="See how your one-of-a-kind ideas are coming along." />
    {authUser?.role !== "customer" ? <section className="dashboard-card order-login-prompt"><h2>Log in to see your maker replies</h2><p>Custom order messages are private to your customer account.</p><button className="button button-primary" onClick={() => { sessionStorage.setItem("vibe-customer-return-path", "/custom-orders"); navigate("/customer/login"); }}>Customer log in ↗</button></section>
      : loading ? <p role="status">Loading your requests…</p>
        : <><Notice message={error} tone="error" /><Notice message={notice} />
          {!requests.length ? <EmptyState title="No custom requests yet" text="Send a maker your idea, then check here for their reply." action="Share an idea" href="/custom-order" link={(to) => (event) => { event.preventDefault(); navigate(to); }} />
            : <div className="custom-customer-list">{requests.map((request) => <CustomerCustomOrderCard
              key={request.id}
              request={request}
              authToken={authToken}
              authUser={authUser}
              onCancel={() => cancelRequest(request)}
              onDelete={() => removeRequest(request)}
              onPaid={() => setRequests((current) => current.map((entry) => entry.id === request.id ? { ...entry, payment_status: "paid" } : entry))}
              navigate={navigate}
            />)}</div>}
        </>}
  </main>;
}

function CustomerCustomOrderCard({ request, authToken, authUser, onCancel, onDelete, onPaid, navigate }) {
  const [address, setAddress] = useState({
    phone: authUser?.phone || request.customer_phone || "",
    address: authUser?.address || request.shipping_address || "",
    city: authUser?.city || request.shipping_city || "",
    pin: authUser?.pin || request.shipping_postal_code || "",
  });
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const accepted = request.status === "accepted";
  const paid = request.payment_status === "paid";
  const delivered = request.order_status === "delivered";
  const displayStatus = delivered ? "delivered" : paid ? "paid" : request.status;
  const canDelete = request.status === "declined" || delivered;

  const proceedToPayment = async () => {
    if (!address.address.trim() || !address.city.trim() || !address.pin.trim()) {
      setError("Add your delivery address, city, and PIN code before payment.");
      return;
    }
    setPaying(true);
    setError("");
    try {
      const response = await apiFetch(`http://localhost:5000/api/custom-orders/${request.id}/payment-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(address),
      });
      const session = await readApiResponse(response);
      if (!response.ok) throw new Error(session.message || "Could not prepare payment.");
      await loadRazorpayCheckout();
      const checkout = new window.Razorpay({
        key: session.keyId,
        amount: session.amount,
        currency: session.currency,
        name: "VIBE",
        description: `Custom order for ${request.shop_name}`,
        order_id: session.razorpayOrderId,
        prefill: { name: authUser.name, email: authUser.email, contact: address.phone },
        theme: { color: "#8DA28A" },
        modal: { ondismiss: () => setPaying(false) },
        handler: async (paymentResult) => {
          try {
            const verifyResponse = await apiFetch("http://localhost:5000/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
              body: JSON.stringify({ orderId: session.orderId, ...paymentResult }),
            });
            const verified = await readApiResponse(verifyResponse);
            if (!verifyResponse.ok) throw new Error(verified.message || "Payment could not be verified.");
            onPaid();
            navigate(`/orders/${session.orderId}`);
          } catch (verificationError) {
            setError(verificationError.message === "Failed to fetch"
              ? "Could not verify payment because the VIBE server is unavailable. Check your orders before trying to pay again."
              : verificationError.message);
            setPaying(false);
          }
        },
      });
      checkout.on("payment.failed", (failure) => {
        setPaying(false);
        setError(failure.error?.description || "Payment was not completed. You can try again.");
      });
      checkout.open();
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
      setPaying(false);
    }
  };

  return <article className="dashboard-card custom-customer-card">
    <div className="card-heading"><div><h2>{request.shop_name}</h2><p>Request #{request.id} · {new Date(request.created_at).toLocaleDateString()}</p></div><span className={`status-pill status-${displayStatus.replaceAll("_", "-")}`}>{displayStatus}</span></div>
    <p className="custom-customer-idea">{request.description}</p>
    {request.idea_images?.length > 0 && <div className="custom-idea-images">{request.idea_images.map((image, index) => <a key={image} href={image} target="_blank" rel="noreferrer"><img src={image} alt={`Idea image ${index + 1}`} /></a>)}</div>}
    {request.seller_message && <div className="custom-seller-message"><strong>Reply from {request.shop_name}</strong><p>{request.seller_message}</p></div>}
    {request.status === "pending" || request.status === "in_progress" ? <p className="form-hint">The maker has not replied yet. Your choices will appear here as soon as they respond.</p>
      : request.status === "declined" ? <p className="form-hint">This request was declined. No payment is due.</p>
        : delivered ? <p className="form-hint">Your custom order has been delivered. <button className="text-button" onClick={() => navigate(`/orders/${request.order_id}`)}>View order details ↗</button></p>
          : paid ? <p className="form-hint">Payment received. <button className="text-button" onClick={() => navigate(`/orders/${request.order_id}`)}>View order status ↗</button></p>
          : accepted && <><div className="custom-quote"><span>Maker’s price</span><strong>{money(request.quoted_price)}</strong></div>{showPayment && <div className="custom-payment-address"><div className="form-row"><Field label="Phone number"><input type="tel" value={address.phone} onChange={(event) => setAddress({ ...address, phone: event.target.value })} /></Field><Field label="PIN code"><input value={address.pin} onChange={(event) => setAddress({ ...address, pin: event.target.value })} /></Field></div><Field label="Delivery address"><textarea rows={2} value={address.address} onChange={(event) => setAddress({ ...address, address: event.target.value })} /></Field><Field label="City"><input value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} /></Field></div>}<Notice message={error} tone="error" /><div className="custom-customer-actions"><button className="button button-primary" disabled={paying} onClick={() => showPayment ? proceedToPayment() : setShowPayment(true)}>{paying ? "Opening secure payment…" : "Proceed to payment ↗"}</button><button className="button button-outline" disabled={paying} onClick={onCancel}>Sorry, I’d like to cancel</button></div></>}
    {canDelete && <div className="custom-customer-actions"><button className="button button-outline" onClick={onDelete}>Remove message</button></div>}
  </article>;
}

function SellerCustomOrdersPage({ navigate, authToken }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const loadRequests = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/custom-orders", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load custom requests.");
        setRequests(result.requests);
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadRequests();
  }, [authToken]);
  if (loading) return <section className="dashboard-card"><p role="status">Loading custom requests…</p></section>;
  if (error) return <section className="dashboard-card"><Notice message={error} tone="error" /></section>;
  if (!requests.length) return <EmptyState title="No custom requests yet" text="Customers’ ideas will appear here when they reach out." />;
  return <section className="dashboard-card"><div className="table-scroll"><table><thead><tr><th>Request</th><th>From</th><th>Their idea</th><th>Status</th><th>Price</th><th></th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td><strong>#{request.id}</strong></td><td>{request.customer_name}</td><td>{request.description}</td><td><span className="status-pill">{request.payment_status === "paid" ? "paid" : request.status}</span></td><td>{request.quoted_price ? money(request.quoted_price) : "—"}</td><td><button className="table-link" onClick={() => navigate(`/seller/custom-order-details/${request.id}`)}>View ↗</button></td></tr>)}</tbody></table></div></section>;
}

function SellerCustomOrderDetails({ requestId, authToken }) {
  const [request, setRequest] = useState(null);
  const [quotedPrice, setQuotedPrice] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const loadRequest = async () => {
      try {
        const response = await apiFetch(`http://localhost:5000/api/custom-orders/${encodeURIComponent(requestId)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load this request.");
        setRequest(result.request);
        setQuotedPrice(result.request.quoted_price || "");
        setMessage(result.request.seller_message || "");
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadRequest();
  }, [authToken, requestId]);

  const reply = async (decision) => {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`http://localhost:5000/api/custom-orders/${requestId}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ decision, quotedPrice, message }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not send your reply.");
      setRequest((current) => ({ ...current, ...result.request }));
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <section className="dashboard-card"><p role="status">Loading custom request…</p></section>;
  if (error && !request) return <section className="dashboard-card"><Notice message={error} tone="error" /></section>;
  if (!request) return <EmptyState title="Request not found" text="This custom request may not belong to your shop." />;
  const canReply = ["pending", "in_progress"].includes(request.status) && !request.order_id;
  return <div className="dashboard-columns">
    <section className="dashboard-card">
      <div className="card-heading"><div><h2>{request.customer_name}’s idea</h2><p>Request #{request.id} · {new Date(request.created_at).toLocaleDateString()}</p></div><span className="status-pill">{request.status}</span></div>
      <div className="request-note">{request.description}</div>
      {request.idea_images?.length > 0 && <div className="custom-idea-images">{request.idea_images.map((image, index) => <a key={image} href={image} target="_blank" rel="noreferrer"><img src={image} alt={`Customer idea ${index + 1}`} /></a>)}</div>}
      <p>{request.customer_email}{request.customer_phone && ` · ${request.customer_phone}`}</p>
      {request.payment_status === "paid" && <p className="form-hint">The customer has paid for this custom order.</p>}
    </section>
    <section className="dashboard-card"><h2>Your reply</h2>
      {canReply ? <>
        <p>Send a message and set your price. Accepting makes secure payment available to the customer.</p>
        <Field label="Your message"><textarea rows={5} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Share what you can make and any details the customer should know." /></Field>
        <Field label="Your price (₹)" required><input type="number" min="0.01" step="0.01" required value={quotedPrice} onChange={(event) => setQuotedPrice(event.target.value)} placeholder="Type your price" /></Field>
        <Notice message={error} tone="error" />
        <div className="custom-customer-actions"><button className="button button-primary" disabled={saving || !quotedPrice || Number(quotedPrice) <= 0} onClick={() => reply("accepted")}>{saving ? "Sending…" : "Accept and send price ↗"}</button><button className="button button-outline" disabled={saving} onClick={() => reply("declined")}>Decline request</button></div>
      </> : <><span className="status-pill">{request.status}</span>{request.quoted_price && <p><strong>Price sent:</strong> {money(request.quoted_price)}</p>}{request.seller_message && <p>{request.seller_message}</p>}</>}
    </section>
  </div>;
}

function ReviewsPage({ authToken }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const loadReviews = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/reviews", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load customer reviews.");
        setReviews(result.reviews);
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadReviews();
  }, [authToken]);
  if (loading) return <section className="dashboard-card"><p role="status">Loading customer reviews…</p></section>;
  if (error) return <section className="dashboard-card"><Notice message={error} tone="error" /></section>;
  if (!reviews.length) return <EmptyState title="No reviews yet" text="Verified reviews from delivered orders will appear here." />;
  return <div className="reviews-list">{reviews.map((review) => <article className="dashboard-card review-card" key={review.id}>
    <span className="review-stars" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
    <blockquote>{review.comment || "A customer left a rating without a note."}</blockquote>
    {review.images?.length > 0 && <div className="review-images">{review.images.map((image, index) => <a key={image} href={image} target="_blank" rel="noreferrer"><img src={image} alt={`Customer review image ${index + 1}`} /></a>)}</div>}
    <div><strong>{review.customer_name} · {review.product_name || "Product"}</strong><span>{new Date(review.created_at).toLocaleDateString()}</span></div>
  </article>)}</div>;
}

function AnalyticsPage({ authToken }) {
  const { analytics, loading, error } = useSellerAnalytics(authToken);
  if (loading || error || !analytics) return <AnalyticsNotice loading={loading} error={error} />;
  return <>
    <AnalyticsStats summary={analytics.summary} />
    <div className="dashboard-columns">
      <section className="dashboard-card performance-card"><div className="card-heading"><div><h2>Sales through the seasons</h2><p>Net sales by month over the last six months</p></div></div><SalesBars rows={analytics.monthlySales} interval="month" /></section>
      <section className="dashboard-card"><h2>Your most-loved creations</h2>{analytics.topProducts.length
        ? analytics.topProducts.map((item, index) => <div className="top-product" key={`${item.product_id}-${item.name}`}><span className="table-product-icon">✿</span><span>{item.name}</span><strong>{index === 0 ? "Best seller · " : ""}{item.units_sold} sold</strong></div>)
        : <p className="chart-empty">Products will appear here after paid orders.</p>}</section>
    </div>
  </>;
}

function ShopSettingsPage({ authToken }) {
  const [shop, setShop] = useState(null);
  const [content, setContent] = useState({});
  const [heroImage, setHeroImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await apiFetch("http://localhost:5000/api/shops/me", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.message || "Could not load your shop settings.");
        setShop(result.shop);
        setContent(result.shop.content || {});
        setHeroImage(result.shop.hero_image || "");
      } catch (requestError) {
        setError(requestError.message === "Failed to fetch"
          ? "Could not reach the VIBE server. Check that the backend is running."
          : requestError.message);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [authToken]);

  const updateContent = (key, value) => {
    setSaved(false);
    setContent((current) => ({ ...current, [key]: value }));
  };

  const uploadArtwork = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadImage(file, "product", authToken);
      setHeroImage(result.image.url);
      setSaved(false);
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setUploading(false);
    }
  };

  const saveShop = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("http://localhost:5000/api/shops/me", {
        method: "PUT",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: form.get("shopName"),
          description: form.get("description"),
          content,
          heroImage,
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.message || "Could not save shop settings.");
      setShop(result.shop);
      setContent(result.shop.content || {});
      setHeroImage(result.shop.hero_image || "");
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message === "Failed to fetch"
        ? "Could not reach the VIBE server. Check that the backend is running."
        : requestError.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="dashboard-card"><p>Loading your storefront settings…</p></section>;
  if (!shop) return <section className="dashboard-card"><Notice message={error} tone="error" /></section>;

  return <section className="dashboard-card form-card seller-form-card">
    {saved && <Notice message="Your storefront text and artwork have been saved." />}
    {error && <Notice message={error} tone="error" />}
    <h2>Edit your shared storefront</h2>
    <p>Only text and your homepage artwork can be changed here. Your products stay private in your seller workspace.</p>
    <div className="storefront-preview-link"><p className="form-hint">Your public homepage: <a href={`/shops/${shop.slug}`} target="_blank" rel="noreferrer">{window.location.origin}/shops/{shop.slug}</a></p><a className="button button-outline" href={`/shops/${shop.slug}`} target="_blank" rel="noreferrer">Preview homepage ↗</a></div>
    <form onSubmit={saveShop}>
      <Field label="Shop name" required><input name="shopName" required maxLength="150" defaultValue={shop.shop_name} /></Field>
      <Field label="Short shop description"><textarea name="description" rows="3" maxLength="500" defaultValue={shop.description || ""} /></Field>
      <section className="storefront-copy-section">
        <h3>Social accounts and contact</h3>
        <p className="form-hint">Add links and contact details to show them on the bottom of your homepage.</p>
        <div className="form-row">
          <Field label="Instagram URL"><input type="url" maxLength="500" value={content.instagramUrl ?? shop.instagram_link ?? ""} onChange={(event) => updateContent("instagramUrl", event.target.value)} placeholder="https://instagram.com/yourshop" /></Field>
          <Field label="Twitter / X URL"><input type="url" maxLength="500" value={content.twitterUrl || ""} onChange={(event) => updateContent("twitterUrl", event.target.value)} placeholder="https://x.com/yourshop" /></Field>
        </div>
        <div className="form-row">
          <Field label="Facebook URL"><input type="url" maxLength="500" value={content.facebookUrl || ""} onChange={(event) => updateContent("facebookUrl", event.target.value)} placeholder="https://facebook.com/yourshop" /></Field>
          <Field label="Bluesky URL"><input type="url" maxLength="500" value={content.blueskyUrl || ""} onChange={(event) => updateContent("blueskyUrl", event.target.value)} placeholder="https://bsky.app/profile/yourshop" /></Field>
        </div>
        <div className="form-row">
          <Field label="Contact email"><input type="text" inputMode="email" maxLength="150" value={content.contactEmail ?? "mycontactemail"} onChange={(event) => updateContent("contactEmail", event.target.value)} placeholder="mycontactemail" /></Field>
          <Field label="Contact phone"><input type="tel" maxLength="30" value={content.contactPhone ?? "9000000000"} onChange={(event) => updateContent("contactPhone", event.target.value)} placeholder="9000000000" /></Field>
        </div>
      </section>
      <div className="storefront-artwork">
        <div><strong>Homepage artwork</strong><p>Upload a JPG, PNG, or WebP image, up to 5 MB.</p></div>
        <label className="button button-outline">{uploading ? "Uploading…" : "Choose artwork"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={uploadArtwork} /></label>
        {heroImage && <div className="storefront-artwork-preview"><img src={heroImage} alt="Current homepage artwork" /><button type="button" className="button button-outline" onClick={() => { setHeroImage(""); setSaved(false); }}>Remove image</button></div>}
      </div>
      {storefrontTextFields.map(({ page, fields }) => <section className="storefront-copy-section" key={page}><h3>{page}</h3>{fields.map(([key, label, defaultValue]) => <Field label={label} key={key}><textarea rows={key.endsWith("Text") ? 3 : 2} maxLength="500" value={content[key] || ""} onChange={(event) => updateContent(key, event.target.value)} placeholder={defaultValue} /></Field>)}</section>)}
      <div className="form-actions"><button type="submit" className="button button-primary" disabled={saving || uploading}>{saving ? "Saving storefront…" : "Save storefront ♡"}</button></div>
    </form>
  </section>;
}

function SettingsPage({ type, authUser, setAuthUser }) {
  const isAccount = type === "account";
  const [saved, setSaved] = useState(false);
  return <section className="dashboard-card form-card seller-form-card">{saved && <Notice message="Your changes have been saved." />}{isAccount ? <><h2>Your details</h2><Field label="Name"><input defaultValue={authUser?.name || "Mira Patel"} onChange={(e) => setAuthUser({ ...authUser, name: e.target.value })} /></Field><Field label="Email address"><input defaultValue={authUser?.email || "hello@miraslittlestudio.com"} type="email" /></Field><Field label="New password"><input type="password" placeholder="Leave blank to keep your password" /></Field><button className="button button-primary" onClick={() => { localStorage.setItem("vibe-user", JSON.stringify(authUser)); setSaved(true); }}>Save account details</button></> : <><h2>Your shop’s little introduction</h2><Field label="Shop name"><input defaultValue="Mira’s Little Studio" /></Field><Field label="Short description"><textarea rows="4" defaultValue="Little things, made slowly and happily in Jaipur. Every piece is designed and handmade with care." /></Field><Field label="Instagram link"><input type="url" defaultValue="https://instagram.com/miraslittlestudio" /></Field><Field label="Your shop announcement"><textarea rows="3" defaultValue="Hello! I’m Mira. Thanks for stopping by my little corner of the internet ♡" /></Field><button className="button button-primary" onClick={() => setSaved(true)}>Save shop changes ♡</button></>}</section>;
}

function ThemedSelect({ options, name, value, defaultValue, onChange, required = false, placeholder, className = "", ariaLabel }) {
  const dropdown = useRef(null);
  const summary = useRef(null);
  const [selected, setSelected] = useState(defaultValue ?? value ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const normalizedOptions = options.map((option) => typeof option === "object"
    ? { label: option.label, value: String(option.value), disabled: Boolean(option.disabled) }
    : { label: option, value: option, disabled: false });
  const currentValue = value === undefined ? selected : value;
  const selectedOption = normalizedOptions.find((option) => String(option.value) === String(currentValue));

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (dropdown.current && !dropdown.current.contains(event.target)) dropdown.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const chooseOption = (option) => {
    if (value === undefined) setSelected(option.value);
    onChange?.(option.value);
    dropdown.current.open = false;
    summary.current.focus();
  };

  const focusOption = (direction) => {
    const enabledOptions = normalizedOptions.filter((option) => !option.disabled);
    if (!enabledOptions.length) return;
    const selectedIndex = enabledOptions.findIndex((option) => String(option.value) === String(currentValue));
    const nextIndex = selectedIndex < 0 ? 0 : (selectedIndex + direction + enabledOptions.length) % enabledOptions.length;
    dropdown.current.open = true;
    requestAnimationFrame(() => dropdown.current?.querySelector(`[data-option-index="${nextIndex}"]`)?.focus());
  };

  return <details className={`themed-select ${className}`} ref={dropdown} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
    <summary ref={summary} role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={isOpen} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusOption(event.key === "ArrowDown" ? 1 : -1);
      }
    }}><span>{selectedOption?.label || placeholder || "Choose an option"}</span><i aria-hidden="true" /></summary>
    <div className="themed-select-options" role="listbox" aria-label={ariaLabel}>
      {normalizedOptions.map((option, index) => <button type="button" role="option" aria-selected={String(option.value) === String(currentValue)} disabled={option.disabled} data-option-index={index} key={`${option.value}-${index}`} onClick={() => chooseOption(option)} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          focusOption(event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Escape") {
          dropdown.current.open = false;
          summary.current.focus();
        }
      }}>{option.label}</button>)}
    </div>
    <select className="themed-select-native" name={name} value={currentValue} required={required} tabIndex="-1" aria-hidden="true" onChange={(event) => {
      if (value === undefined) setSelected(event.target.value);
      onChange?.(event.target.value);
    }} onInvalid={(event) => {
      event.preventDefault();
      dropdown.current.open = true;
      summary.current.focus();
    }}>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {normalizedOptions.map((option, index) => <option value={option.value} disabled={option.disabled} key={`${option.value}-native-${index}`}>{option.label}</option>)}
    </select>
  </details>;
}

function Field({ label, required = false, children }) {
  return <label className="field"><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}</label>;
}

function PageHeading({ eyebrow, title, text }) {
  return <div className="page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{text && <p>{text}</p>}</div>;
}

function Notice({ message, tone = "success" }) {
  return message ? <div className={`notice notice-${tone}`} role="status">{message}</div> : null;
}

function EmptyState({ title, text, action, href, link, onAction }) {
  return <div className="empty-state"><span>✿</span><h2>{title}</h2><p>{text}</p>{action && (onAction
    ? <button className="button button-primary" onClick={onAction}>{action}</button>
    : href && link && <a className="button button-primary" href={href} onClick={link(href)}>{action} ↗</a>)}</div>;
}

export default App;
