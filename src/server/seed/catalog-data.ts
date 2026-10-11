/**
 * Demonstration catalog (PRD CAT-6, decision D2). Buildings and restaurant NAMES are real University of
 * Houston campus places (UH Student Centers and UH Dining Services listings, checked 2026-10-10).
 * Everything else about the restaurants — descriptions, menus, prices, options, and hours — is SAMPLE
 * DATA invented for the demo. It is not the venues' real menu or pricing, and no venue participates in or
 * endorses CoogCrave. Every restaurant is flagged is_sample_data and the UI labels it "Sample menu — not
 * affiliated". No logos or brand marks are used. Re-check venue names before a demo: campus dining changes.
 */

export const CAMPUS = {
  key: "uh-main",
  slug: "uh-main",
  name: "University of Houston, main campus",
  timezone: "America/Chicago",
  // Sample fee settings (integer cents / basis points). Shown as sample values in the UI.
  deliveryFeeCents: 249,
  serviceFeeBps: 500,
  serviceFeeMinCents: 50,
  serviceFeeMaxCents: 300,
  taxRateBps: 825,
  minSubtotalCents: 500,
  maxTipCents: 5000,
} as const;

export interface LocationSeed {
  key: string;
  name: string;
  shortName: string;
  description: string;
  isDropPoint: boolean;
}

/** Descriptions are sample hand-off hints for the demo, not official building guidance. */
export const LOCATIONS: LocationSeed[] = [
  {
    key: "library",
    name: "M.D. Anderson Memorial Library",
    shortName: "Library",
    description: "Main entrance, by the bike racks",
    isDropPoint: true,
  },
  {
    key: "scs",
    name: "Student Center South",
    shortName: "Student Center South",
    description: "Food court entrance",
    isDropPoint: true,
  },
  {
    key: "scn",
    name: "Student Center North",
    shortName: "Student Center North",
    description: "Ground-floor lobby",
    isDropPoint: true,
  },
  {
    key: "pgh",
    name: "Philip Guthrie Hoffman Hall",
    shortName: "PGH",
    description: "Main lobby",
    isDropPoint: true,
  },
  {
    key: "aah",
    name: "Agnes Arnold Hall",
    shortName: "Agnes Arnold",
    description: "Front doors",
    isDropPoint: true,
  },
  {
    key: "sr1",
    name: "Science & Research Building 1",
    shortName: "SR1",
    description: "Main lobby",
    isDropPoint: true,
  },
  {
    key: "eng1",
    name: "Engineering Building 1",
    shortName: "Engineering 1",
    description: "South entrance",
    isDropPoint: true,
  },
  {
    key: "melcher",
    name: "Melcher Hall",
    shortName: "Melcher",
    description: "Main entrance",
    isDropPoint: true,
  },
  {
    key: "hbs",
    name: "Health and Biomedical Sciences Building",
    shortName: "HBSB",
    description: "Front entrance",
    isDropPoint: true,
  },
  {
    key: "crwc",
    name: "Campus Recreation and Wellness Center",
    shortName: "Rec Center",
    description: "Front desk entrance",
    isDropPoint: true,
  },
  {
    key: "cv1",
    name: "Cougar Village I",
    shortName: "Cougar Village I",
    description: "Lobby",
    isDropPoint: true,
  },
  {
    key: "cv2",
    name: "Cougar Village II",
    shortName: "Cougar Village II",
    description: "Lobby",
    isDropPoint: true,
  },
  {
    key: "moody",
    name: "Moody Towers",
    shortName: "Moody Towers",
    description: "Front desk",
    isDropPoint: true,
  },
  {
    key: "rad",
    name: "Retail, Auxiliary, and Dining (RAD) Center",
    shortName: "RAD Center",
    description: "Main entrance",
    isDropPoint: true,
  },
];

export const CUISINES = [
  { key: "burgers", name: "Burgers" },
  { key: "chicken", name: "Chicken" },
  { key: "mexican", name: "Mexican" },
  { key: "latin", name: "Latin" },
  { key: "asian", name: "Asian" },
  { key: "sandwiches", name: "Sandwiches" },
  { key: "coffee", name: "Coffee" },
  { key: "desserts", name: "Desserts" },
  { key: "breakfast", name: "Breakfast" },
  { key: "vegetarian", name: "Vegetarian" },
] as const;

type CuisineKey = (typeof CUISINES)[number]["key"];

/** [opens, closes] in minutes after midnight, campus time. Closing after 24:00 runs past midnight. */
type Hours = [number, number] | null;
/** Sunday-first, like day_of_week (0 = Sunday). */
type Week = [Hours, Hours, Hours, Hours, Hours, Hours, Hours];

const h = (hh: number, mm = 0) => hh * 60 + mm;
const weekdays = (hours: Hours, weekend: Hours = null): Week => [
  weekend,
  hours,
  hours,
  hours,
  hours,
  hours,
  weekend,
];

export interface OptionGroupSeed {
  key: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { key: string; name: string; priceDeltaCents: number }[];
}

export interface ItemSeed {
  key: string;
  name: string;
  description: string;
  priceCents: number;
  isAvailable?: boolean;
  optionGroups?: OptionGroupSeed[];
}

export interface RestaurantSeed {
  key: string;
  slug: string;
  name: string;
  description: string;
  pickupLocation: string;
  pickupNotes: string;
  cuisines: CuisineKey[];
  week: Week;
  categories: { key: string; name: string; items: ItemSeed[] }[];
}

const item = (
  key: string,
  name: string,
  description: string,
  priceCents: number,
  extra: Partial<ItemSeed> = {},
): ItemSeed => ({ key, name, description, priceCents, ...extra });

const choice = (
  key: string,
  name: string,
  options: [key: string, name: string, priceDeltaCents: number][],
): OptionGroupSeed => ({
  key,
  name,
  minSelect: 1,
  maxSelect: 1,
  options: options.map(([k, n, p]) => ({ key: k, name: n, priceDeltaCents: p })),
});

const addOns = (
  key: string,
  maxSelect: number,
  options: [key: string, name: string, priceDeltaCents: number][],
): OptionGroupSeed => ({
  key,
  name: "Add-ons",
  minSelect: 0,
  maxSelect,
  options: options.map(([k, n, p]) => ({ key: k, name: n, priceDeltaCents: p })),
});

/** Real UH venue names; menus, prices, and hours are sample data (see the header comment). */
export const RESTAURANTS: RestaurantSeed[] = [
  // ── RAD Center ──────────────────────────────────────────────────────────────
  {
    key: "the-burger-joint",
    slug: "the-burger-joint",
    name: "The Burger Joint",
    description: "Burgers, fries, and shakes.",
    pickupLocation: "rad",
    pickupNotes: "Pickup shelf next to the register.",
    cuisines: ["burgers"],
    week: weekdays([h(10, 30), h(21)], [h(11), h(19)]),
    categories: [
      {
        key: "burgers",
        name: "Burgers",
        items: [
          item(
            "double-cheeseburger",
            "Double cheeseburger",
            "Two patties, American cheese, pickles, house sauce.",
            899,
            {
              optionGroups: [
                addOns("double-cheeseburger-addons", 3, [
                  ["bacon", "Bacon", 150],
                  ["jalapenos", "Grilled jalapeños", 75],
                  ["egg", "Fried egg", 125],
                ]),
              ],
            },
          ),
          item("cheeseburger", "Cheeseburger", "One patty, cheese, lettuce, tomato, onion.", 649),
          item("veggie-burger", "Black bean burger", "Spiced black bean patty, avocado, pico.", 799),
        ],
      },
      {
        key: "sides",
        name: "Sides and shakes",
        items: [
          item("fries", "Fries", "Crisp and salted.", 349),
          item("milkshake", "Milkshake", "Thick and cold.", 499, {
            optionGroups: [
              choice("milkshake-flavor", "Flavor", [
                ["vanilla", "Vanilla", 0],
                ["chocolate", "Chocolate", 0],
                ["strawberry", "Strawberry", 0],
              ]),
            ],
          }),
        ],
      },
    ],
  },
  {
    key: "the-taco-stand",
    slug: "the-taco-stand",
    name: "The Taco Stand",
    description: "Tacos, burritos, and breakfast tacos in the morning.",
    pickupLocation: "rad",
    pickupNotes: "Orders wait in the warmer by the salsa bar.",
    cuisines: ["mexican", "breakfast"],
    week: weekdays([h(7, 30), h(20)], [h(10), h(16)]),
    categories: [
      {
        key: "tacos",
        name: "Tacos and burritos",
        items: [
          item("taco-plate", "Three-taco plate", "Corn tortillas, onion, cilantro, salsa verde.", 999, {
            optionGroups: [
              choice("taco-filling", "Filling", [
                ["chicken", "Grilled chicken", 0],
                ["barbacoa", "Barbacoa", 100],
                ["veggie", "Grilled vegetables", 0],
              ]),
            ],
          }),
          item(
            "bean-cheese-burrito",
            "Bean and cheese burrito",
            "Refried beans, cheddar, flour tortilla.",
            649,
          ),
        ],
      },
      {
        key: "breakfast",
        name: "Breakfast",
        items: [
          item("breakfast-taco", "Egg and potato breakfast taco", "Scrambled egg, potato, cheese.", 349),
        ],
      },
    ],
  },
  {
    key: "absurd-bird",
    slug: "absurd-bird",
    name: "Absurd Bird",
    description: "Chicken tenders, sandwiches, and sides.",
    pickupLocation: "rad",
    pickupNotes: "Pickup counter at the end of the line.",
    cuisines: ["chicken"],
    week: weekdays([h(11), h(21)], [h(11), h(18)]),
    categories: [
      {
        key: "tenders",
        name: "Tenders",
        items: [
          item("tender-combo", "Three-tender combo", "Tenders, fries, and a dipping sauce.", 1049, {
            optionGroups: [
              choice("tender-sauce", "Sauce", [
                ["house", "House sauce", 0],
                ["honey-mustard", "Honey mustard", 0],
                ["buffalo", "Buffalo", 0],
              ]),
            ],
          }),
          item(
            "chicken-sandwich",
            "Crispy chicken sandwich",
            "Fried chicken, slaw, pickles, brioche bun.",
            899,
          ),
        ],
      },
    ],
  },
  {
    key: "paper-lantern",
    slug: "paper-lantern",
    name: "Paper Lantern",
    description: "Asian grill: rice bowls, noodles, and dumplings.",
    pickupLocation: "rad",
    pickupNotes: "Numbered pickup cubbies by the door.",
    cuisines: ["asian"],
    week: weekdays([h(11), h(20)]),
    categories: [
      {
        key: "bowls",
        name: "Bowls and noodles",
        items: [
          item("grill-bowl", "Grill bowl", "Steamed rice, grilled protein, vegetables, sauce.", 1099, {
            optionGroups: [
              choice("grill-bowl-protein", "Protein", [
                ["chicken", "Teriyaki chicken", 0],
                ["beef", "Bulgogi beef", 150],
                ["tofu", "Sesame tofu", 0],
              ]),
            ],
          }),
          item("veg-lo-mein", "Vegetable lo mein", "Wok-tossed noodles and vegetables.", 949),
        ],
      },
      {
        key: "dumplings",
        name: "Dumplings",
        items: [item("potstickers", "Pork potstickers", "Six, pan-fried, with dipping sauce.", 649)],
      },
    ],
  },
  {
    key: "katz-coffee",
    slug: "katz-coffee",
    name: "Katz Coffee",
    description: "Coffee, tea, and pastries.",
    pickupLocation: "rad",
    pickupNotes: "Drinks are set out at the hand-off counter.",
    cuisines: ["coffee", "breakfast"],
    week: weekdays([h(7), h(18)], [h(9), h(14)]),
    categories: [
      {
        key: "coffee",
        name: "Coffee and tea",
        items: [
          item("latte", "Latte", "Espresso and steamed milk.", 475, {
            optionGroups: [
              choice("latte-size", "Size", [
                ["regular", "Regular", 0],
                ["large", "Large", 75],
              ]),
              choice("latte-milk", "Milk", [
                ["whole", "Whole milk", 0],
                ["oat", "Oat milk", 75],
              ]),
            ],
          }),
          item("cold-brew", "Cold brew", "Slow-steeped, served over ice.", 425),
        ],
      },
      {
        key: "pastries",
        name: "Pastries",
        items: [
          item("croissant", "Butter croissant", "Baked this morning.", 375),
          item("muffin", "Blueberry muffin", "Sold out for today.", 350, { isAvailable: false }),
        ],
      },
    ],
  },
  // ── Student Center South ────────────────────────────────────────────────────
  {
    key: "chick-fil-a",
    slug: "chick-fil-a",
    name: "Chick-fil-A",
    description: "Chicken sandwiches, nuggets, and waffle fries.",
    pickupLocation: "scs",
    pickupNotes: "Second-floor food court; mobile-order shelf.",
    cuisines: ["chicken"],
    // Sample hours; closed Sundays.
    week: [
      null,
      [h(7, 30), h(20)],
      [h(7, 30), h(20)],
      [h(7, 30), h(20)],
      [h(7, 30), h(20)],
      [h(7, 30), h(17)],
      [h(10), h(15)],
    ],
    categories: [
      {
        key: "entrees",
        name: "Entrées",
        items: [
          item("chicken-sandwich", "Chicken sandwich", "Breaded chicken breast, pickles, toasted bun.", 649),
          item("nuggets", "Nuggets", "Bite-sized breaded chicken.", 599, {
            optionGroups: [
              choice("nuggets-count", "Count", [
                ["8", "8 count", 0],
                ["12", "12 count", 250],
              ]),
            ],
          }),
        ],
      },
      {
        key: "sides",
        name: "Sides",
        items: [item("waffle-fries", "Waffle fries", "Medium order.", 299)],
      },
    ],
  },
  {
    key: "panda-express",
    slug: "panda-express",
    name: "Panda Express",
    description: "American Chinese plates and bowls.",
    pickupLocation: "scs",
    pickupNotes: "Second-floor food court; pickup at the end of the line.",
    cuisines: ["asian"],
    week: weekdays([h(10, 30), h(20)], [h(11), h(17)]),
    categories: [
      {
        key: "plates",
        name: "Plates and bowls",
        items: [
          item("bowl", "Bowl", "One side and one entrée.", 899, {
            optionGroups: [
              choice("bowl-side", "Side", [
                ["fried-rice", "Fried rice", 0],
                ["chow-mein", "Chow mein", 0],
                ["steamed-rice", "Steamed rice", 0],
              ]),
              choice("bowl-entree", "Entrée", [
                ["orange-chicken", "Orange chicken", 0],
                ["broccoli-beef", "Broccoli beef", 0],
                ["mixed-veg", "Mixed vegetables", 0],
              ]),
            ],
          }),
          item("plate", "Two-entrée plate", "One side and two entrées.", 1099),
        ],
      },
    ],
  },
  {
    key: "starbucks",
    slug: "starbucks",
    name: "Starbucks",
    description: "Coffee, tea, and snacks.",
    pickupLocation: "scs",
    pickupNotes: "First floor, next to the game room; mobile-order counter.",
    cuisines: ["coffee", "breakfast"],
    week: weekdays([h(7), h(21)], [h(9), h(17)]),
    categories: [
      {
        key: "drinks",
        name: "Drinks",
        items: [
          item("iced-coffee", "Iced coffee", "Brewed coffee over ice.", 395, {
            optionGroups: [
              choice("iced-coffee-size", "Size", [
                ["regular", "Regular", 0],
                ["large", "Large", 70],
              ]),
            ],
          }),
          item("chai-latte", "Chai tea latte", "Spiced black tea and steamed milk.", 525),
        ],
      },
      {
        key: "food",
        name: "Food",
        items: [item("egg-bites", "Egg bites", "Two, with cheese.", 495)],
      },
    ],
  },
  {
    key: "asado",
    slug: "asado",
    name: "Asado",
    description: "Grilled plates and bowls.",
    pickupLocation: "scs",
    pickupNotes: "Pickup counter beside the grill.",
    cuisines: ["latin"],
    week: weekdays([h(11), h(19)]),
    categories: [
      {
        key: "plates",
        name: "Plates and bowls",
        items: [
          item("grill-bowl", "Grill bowl", "Rice, black beans, grilled protein, salsa.", 1049, {
            optionGroups: [
              choice("asado-protein", "Protein", [
                ["chicken", "Grilled chicken", 0],
                ["steak", "Steak", 200],
                ["veggie", "Roasted vegetables", 0],
              ]),
            ],
          }),
          item("empanadas", "Empanadas", "Two, with chimichurri.", 699),
        ],
      },
    ],
  },
  {
    key: "houston-street-subs",
    slug: "houston-street-subs",
    name: "Houston Street Subs",
    description: "Made-to-order subs and wraps.",
    pickupLocation: "scs",
    pickupNotes: "Pickup at the end of the sandwich line.",
    cuisines: ["sandwiches", "vegetarian"],
    week: weekdays([h(10), h(20)], [h(11), h(16)]),
    categories: [
      {
        key: "subs",
        name: "Subs",
        items: [
          item("turkey-sub", "Turkey sub", "Turkey, provolone, lettuce, tomato.", 849, {
            optionGroups: [
              choice("turkey-sub-size", "Size", [
                ["six", "6 inch", 0],
                ["twelve", "12 inch", 350],
              ]),
            ],
          }),
          item("veggie-sub", "Veggie sub", "Cucumber, peppers, spinach, hummus.", 749),
        ],
      },
    ],
  },
  {
    key: "shastas-cones",
    slug: "shastas-cones",
    name: "Shasta's Cones & More",
    description: "Ice cream, cones, and treats.",
    pickupLocation: "scs",
    pickupNotes: "Orders packed in insulated bags at the counter.",
    cuisines: ["desserts"],
    week: weekdays([h(12), h(21)], [h(13), h(19)]),
    categories: [
      {
        key: "ice-cream",
        name: "Ice cream",
        items: [
          item("cup", "Ice cream cup", "Two scoops.", 449, {
            optionGroups: [
              choice("cup-flavor", "Flavor", [
                ["vanilla", "Vanilla", 0],
                ["chocolate", "Chocolate", 0],
                ["cookies-cream", "Cookies and cream", 0],
              ]),
            ],
          }),
          item("sundae", "Brownie sundae", "Brownie, vanilla ice cream, fudge.", 599),
        ],
      },
    ],
  },
];
