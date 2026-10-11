/**
 * Demonstration catalog (PRD CAT-6). Buildings are real University of Houston campus buildings, used as
 * delivery destinations. Restaurants are FICTIONAL: names, menus, prices, and hours are sample data
 * invented for the demo, so no real business is implied to participate. Every restaurant is flagged
 * is_sample_data and labeled in the UI.
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
];

export const CUISINES = [
  { key: "burgers", name: "Burgers" },
  { key: "mexican", name: "Mexican" },
  { key: "bowls", name: "Bowls" },
  { key: "healthy", name: "Healthy" },
  { key: "coffee", name: "Coffee" },
  { key: "bakery", name: "Bakery" },
  { key: "pizza", name: "Pizza" },
  { key: "asian", name: "Asian" },
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

const SIZE = (key: string, small: number, large: number): OptionGroupSeed => ({
  key: `${key}-size`,
  name: "Size",
  minSelect: 1,
  maxSelect: 1,
  options: [
    { key: "regular", name: "Regular", priceDeltaCents: small },
    { key: "large", name: "Large", priceDeltaCents: large },
  ],
});

export const RESTAURANTS: RestaurantSeed[] = [
  {
    key: "smash-and-shake",
    slug: "smash-and-shake",
    name: "Smash & Shake",
    description: "Griddle-smashed burgers, crinkle and shoestring fries, and thick shakes.",
    pickupLocation: "scs",
    pickupNotes: "Pickup shelf to the left of the register.",
    cuisines: ["burgers"],
    week: weekdays([h(10, 30), h(21)], [h(11), h(19)]),
    categories: [
      {
        key: "burgers",
        name: "Burgers",
        items: [
          {
            key: "double-smash",
            name: "Double smash burger",
            description: "Two smashed patties, American cheese, pickles, house sauce.",
            priceCents: 899,
            optionGroups: [
              {
                key: "double-smash-addons",
                name: "Add-ons",
                minSelect: 0,
                maxSelect: 3,
                options: [
                  { key: "bacon", name: "Bacon", priceDeltaCents: 150 },
                  { key: "jalapenos", name: "Grilled jalapeños", priceDeltaCents: 75 },
                  { key: "egg", name: "Fried egg", priceDeltaCents: 125 },
                ],
              },
            ],
          },
          {
            key: "single-smash",
            name: "Single smash burger",
            description: "One patty, cheese, pickles, onion.",
            priceCents: 649,
          },
          {
            key: "black-bean",
            name: "Black bean burger",
            description: "Spiced black bean patty, avocado, pico.",
            priceCents: 799,
          },
        ],
      },
      {
        key: "sides",
        name: "Sides",
        items: [
          {
            key: "shoestring",
            name: "Shoestring fries",
            description: "Thin, crisp, salted.",
            priceCents: 349,
          },
          {
            key: "crinkle",
            name: "Crinkle fries",
            description: "Thick-cut with seasoning salt.",
            priceCents: 349,
          },
        ],
      },
      {
        key: "shakes",
        name: "Shakes",
        items: [
          {
            key: "shake",
            name: "Milkshake",
            description: "Vanilla, chocolate, or strawberry.",
            priceCents: 499,
            optionGroups: [
              {
                key: "shake-flavor",
                name: "Flavor",
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { key: "vanilla", name: "Vanilla", priceDeltaCents: 0 },
                  { key: "chocolate", name: "Chocolate", priceDeltaCents: 0 },
                  { key: "strawberry", name: "Strawberry", priceDeltaCents: 0 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "third-ward-taqueria",
    slug: "third-ward-taqueria",
    name: "Third Ward Taqueria",
    description: "Street tacos, burritos, and agua fresca.",
    pickupLocation: "scs",
    pickupNotes: "Orders wait in the warmer by the salsa bar.",
    cuisines: ["mexican"],
    week: weekdays([h(10), h(20)], [h(11), h(17)]),
    categories: [
      {
        key: "tacos",
        name: "Tacos",
        items: [
          {
            key: "taco-plate",
            name: "Three-taco plate",
            description: "Corn tortillas, onion, cilantro, salsa verde.",
            priceCents: 999,
            optionGroups: [
              {
                key: "taco-protein",
                name: "Filling",
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { key: "pastor", name: "Al pastor", priceDeltaCents: 0 },
                  { key: "barbacoa", name: "Barbacoa", priceDeltaCents: 100 },
                  { key: "veggie", name: "Grilled vegetables", priceDeltaCents: 0 },
                ],
              },
            ],
          },
          {
            key: "burrito",
            name: "Bean and cheese burrito",
            description: "Refried beans, cheddar, flour tortilla.",
            priceCents: 649,
          },
        ],
      },
      {
        key: "drinks",
        name: "Drinks",
        items: [
          {
            key: "horchata",
            name: "Horchata",
            description: "Cinnamon rice drink.",
            priceCents: 349,
            optionGroups: [SIZE("horchata", 0, 100)],
          },
        ],
      },
    ],
  },
  {
    key: "bayou-bowls",
    slug: "bayou-bowls",
    name: "Bayou Bowls",
    description: "Rice and grain bowls with roasted vegetables and house dressings.",
    pickupLocation: "scn",
    pickupNotes: "Pickup counter at the end of the line.",
    cuisines: ["bowls", "healthy", "vegetarian"],
    week: weekdays([h(10, 30), h(19, 30)]),
    categories: [
      {
        key: "bowls",
        name: "Bowls",
        items: [
          {
            key: "build-bowl",
            name: "Build-your-own bowl",
            description: "Choose a base and a protein; comes with roasted vegetables.",
            priceCents: 1049,
            optionGroups: [
              {
                key: "bowl-base",
                name: "Base",
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { key: "rice", name: "Jasmine rice", priceDeltaCents: 0 },
                  { key: "quinoa", name: "Quinoa", priceDeltaCents: 50 },
                  { key: "greens", name: "Mixed greens", priceDeltaCents: 0 },
                ],
              },
              {
                key: "bowl-protein",
                name: "Protein",
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { key: "chicken", name: "Grilled chicken", priceDeltaCents: 0 },
                  { key: "tofu", name: "Crispy tofu", priceDeltaCents: 0 },
                  { key: "salmon", name: "Salmon", priceDeltaCents: 250 },
                ],
              },
            ],
          },
          {
            key: "falafel-bowl",
            name: "Falafel bowl",
            description: "Falafel, hummus, cucumber, tahini.",
            priceCents: 999,
          },
          {
            key: "seasonal-bowl",
            name: "Seasonal bowl",
            description: "Ask at the counter. Not available today.",
            priceCents: 1099,
            isAvailable: false,
          },
        ],
      },
    ],
  },
  {
    key: "study-break-coffee",
    slug: "study-break-coffee",
    name: "Study Break Coffee",
    description: "Espresso drinks, cold brew, and pastries near the stacks.",
    pickupLocation: "library",
    pickupNotes: "Pickup at the end of the espresso bar.",
    cuisines: ["coffee", "bakery"],
    week: [[h(10), h(18)], [h(7), h(26)], [h(7), h(26)], [h(7), h(26)], [h(7), h(26)], [h(7), h(20)], null],
    categories: [
      {
        key: "coffee",
        name: "Coffee",
        items: [
          {
            key: "latte",
            name: "Latte",
            description: "Double shot with steamed milk.",
            priceCents: 449,
            optionGroups: [
              SIZE("latte", 0, 75),
              {
                key: "latte-milk",
                name: "Milk",
                minSelect: 0,
                maxSelect: 1,
                options: [
                  { key: "oat", name: "Oat milk", priceDeltaCents: 60 },
                  { key: "almond", name: "Almond milk", priceDeltaCents: 60 },
                ],
              },
            ],
          },
          {
            key: "cold-brew",
            name: "Cold brew",
            description: "Steeped overnight.",
            priceCents: 399,
            optionGroups: [SIZE("cold-brew", 0, 75)],
          },
        ],
      },
      {
        key: "pastries",
        name: "Pastries",
        items: [
          {
            key: "kolache",
            name: "Sausage kolache",
            description: "Baked fresh every morning.",
            priceCents: 299,
          },
          { key: "croissant", name: "Butter croissant", description: "Flaky and warm.", priceCents: 349 },
        ],
      },
    ],
  },
  {
    key: "late-lab-pizza",
    slug: "late-lab-pizza",
    name: "Late Lab Pizza",
    description: "Pizza by the slice or whole pie, open late for long study nights.",
    pickupLocation: "cv1",
    pickupNotes: "Window on the courtyard side.",
    cuisines: ["pizza", "vegetarian"],
    week: [
      [h(16), h(24)],
      [h(11), h(25)],
      [h(11), h(25)],
      [h(11), h(25)],
      [h(11), h(25)],
      [h(11), h(26)],
      [h(16), h(26)],
    ],
    categories: [
      {
        key: "pizza",
        name: "Pizza",
        items: [
          {
            key: "slice",
            name: "Slice",
            description: "A big New York-style slice.",
            priceCents: 399,
            optionGroups: [
              {
                key: "slice-kind",
                name: "Kind",
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { key: "cheese", name: "Cheese", priceDeltaCents: 0 },
                  { key: "pepperoni", name: "Pepperoni", priceDeltaCents: 50 },
                  { key: "veggie", name: "Veggie", priceDeltaCents: 50 },
                ],
              },
            ],
          },
          {
            key: "whole-pie",
            name: "Whole cheese pie",
            description: "Eight slices, 18 inches.",
            priceCents: 1899,
          },
        ],
      },
    ],
  },
  {
    key: "noodle-line",
    slug: "noodle-line",
    name: "Noodle Line",
    description: "Ramen, lo mein, and dumplings.",
    pickupLocation: "scn",
    pickupNotes: "Numbered pickup cubbies by the door.",
    cuisines: ["asian"],
    week: weekdays([h(11), h(20)]),
    categories: [
      {
        key: "noodles",
        name: "Noodles",
        items: [
          {
            key: "shoyu-ramen",
            name: "Shoyu ramen",
            description: "Soy broth, chashu, soft egg, scallion.",
            priceCents: 1149,
          },
          {
            key: "veg-lo-mein",
            name: "Vegetable lo mein",
            description: "Wok-tossed noodles and vegetables.",
            priceCents: 949,
          },
        ],
      },
      {
        key: "dumplings",
        name: "Dumplings",
        items: [
          {
            key: "potstickers",
            name: "Pork potstickers",
            description: "Six, pan-fried, with dipping sauce.",
            priceCents: 649,
          },
        ],
      },
    ],
  },
];
