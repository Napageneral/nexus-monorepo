function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const DEVENIR_AESTHETICS_WIX_PROFILE = Object.freeze({
  profile_id: "devenir-aesthetics",
  display_name: "Devenir Aesthetics",
  website_origin: "https://www.deveniratx.com",
  site_hostnames: ["www.deveniratx.com", "deveniratx.com"],
  supported_locales: ["es"],
  route_families: [
    {
      page_family: "home",
      exact_paths: ["/"],
      page_event_name: "page_view",
      surface_category: "page",
    },
    {
      page_family: "services",
      exact_paths: ["/services"],
      page_event_name: "page_view",
      surface_category: "services",
    },
    {
      page_family: "booking",
      exact_paths: ["/bookonline"],
      page_event_name: "page_view",
      surface_category: "booking",
    },
    {
      page_family: "product",
      path_prefixes: ["/product-page/"],
      page_event_name: "product_view",
      surface_category: "product",
    },
    {
      page_family: "gift_card",
      exact_paths: ["/gift-card"],
      page_event_name: "page_view",
      surface_category: "gift_card",
    },
    {
      page_family: "storefront",
      exact_paths: [
        "/shop",
        "/shop-1",
        "/isdinproducts",
        "/skinbetterproducts",
        "/alastinproducts",
        "/epionceproducts",
        "/revision-skincare",
        "/skinceuticals",
        "/elta-md-1",
      ],
      page_event_name: "page_view",
      surface_category: "storefront",
    },
    {
      page_family: "membership",
      exact_paths: ["/memberships"],
      page_event_name: "page_view",
      surface_category: "membership",
    },
    {
      page_family: "loyalty",
      exact_paths: ["/loyalty"],
      page_event_name: "page_view",
      surface_category: "loyalty",
    },
    {
      page_family: "contact",
      exact_paths: ["/contact"],
      page_event_name: "page_view",
      surface_category: "contact",
    },
    {
      page_family: "specials",
      exact_paths: ["/specials", "/specials-1"],
      page_event_name: "page_view",
      surface_category: "specials",
    },
    {
      page_family: "referral",
      exact_paths: ["/refer-friends", "/referral"],
      page_event_name: "page_view",
      surface_category: "referral",
    },
    {
      page_family: "event",
      path_prefixes: ["/event-details/"],
      page_event_name: "page_view",
      surface_category: "event",
    },
  ],
  booking_targets: {
    hosts: ["deveniratx.zenoti.com"],
    path_prefixes: ["/webstoreNew/services/"],
    control_labels: ["Book", "Book Now", "Book Online", "Book your Appointment"],
  },
  control_labels: {
    cart_add: ["Add to Cart"],
    checkout_start: ["Checkout"],
    gift_card_buy_now: ["Buy Now"],
  },
  form_rules: {
    tracked_page_families: ["home", "contact"],
    include_class_tokens: ["wixui-form"],
    exclude_actions: ["/search"],
    exclude_roles: ["search"],
    exclude_testids: ["search-box-form"],
    form_family: "lead_capture",
  },
  proof_urls: [
    "https://www.deveniratx.com/",
    "https://www.deveniratx.com/services",
    "https://www.deveniratx.com/bookonline",
    "https://www.deveniratx.com/shop",
    "https://www.deveniratx.com/product-page/eltamd-uv-aox-eye-broad-spectrum-spf-30",
    "https://www.deveniratx.com/gift-card",
    "https://www.deveniratx.com/memberships",
    "https://www.deveniratx.com/loyalty",
    "https://www.deveniratx.com/contact",
    "https://www.deveniratx.com/specials",
    "https://www.deveniratx.com/refer-friends",
    "https://www.deveniratx.com/event-details/annual-patient-appreciation-event",
  ],
});

export function getDevenirAestheticsWixProfile() {
  return deepClone(DEVENIR_AESTHETICS_WIX_PROFILE);
}
