export type NextBuildCategory =
  | 'roads'
  | 'transit'
  | 'residential'
  | 'commercial'
  | 'industry'
  | 'services'
  | 'utilities'
  | 'recreation'
  | 'environment';

export interface NextBuildCatalogEntry {
  id: string;
  name: string;
  category: NextBuildCategory;
  footprint: { width: number; height: number };
  buildCost: number;
  monthlyUpkeep: number;
  unlockPopulation: number;
  capacity?: number;
  jobs?: number;
  noise?: number;
  pollution?: number;
  tags: string[];
  description: string;
}

const entry = (
  data: Omit<NextBuildCatalogEntry, 'footprint'> & { footprint?: [number, number] },
): NextBuildCatalogEntry => ({
  ...data,
  footprint: {
    width: data.footprint?.[0] ?? 1,
    height: data.footprint?.[1] ?? 1,
  },
});

/**
 * Expansion catalog for IsoCity Next.
 *
 * These entries are deliberately data-only. Rendering, simulation effects and
 * placement rules should consume this catalog rather than growing more large
 * switch statements. Costs are initial balancing values, not final economy data.
 */
export const NEXT_GENERATION_BUILD_CATALOG: NextBuildCatalogEntry[] = [
  // Roads and public realm
  entry({ id: 'street_residential', name: 'Residential Street', category: 'roads', buildCost: 35, monthlyUpkeep: 1, unlockPopulation: 0, capacity: 450, tags: ['road', '30kmh', 'sidewalk', 'parking'], description: 'Quiet two-way residential street with sidewalks and optional parking.' }),
  entry({ id: 'street_one_way', name: 'One-way Street', category: 'roads', buildCost: 32, monthlyUpkeep: 1, unlockPopulation: 300, capacity: 650, tags: ['road', 'one-way', 'urban'], description: 'Compact one-way street useful for town centres and circulation plans.' }),
  entry({ id: 'fietsstraat', name: 'Bicycle Street', category: 'roads', buildCost: 42, monthlyUpkeep: 1, unlockPopulation: 750, capacity: 350, tags: ['road', 'cycling', 'low-speed', 'dutch-urbanism'], description: 'Cycle-priority street where motor vehicles are guests.' }),
  entry({ id: 'pedestrian_street', name: 'Pedestrian Street', category: 'roads', buildCost: 48, monthlyUpkeep: 2, unlockPopulation: 1200, tags: ['walking', 'shopping', 'public-realm'], description: 'Car-free street for shopping areas, centres and station districts.' }),
  entry({ id: 'urban_avenue', name: 'Urban Avenue', category: 'roads', buildCost: 85, monthlyUpkeep: 3, unlockPopulation: 1500, capacity: 1800, tags: ['road', 'trees', 'median', 'bike-lane'], description: 'Tree-lined urban distributor with cycle tracks and a landscaped median.' }),
  entry({ id: 'boulevard_transit', name: 'Transit Boulevard', category: 'roads', buildCost: 120, monthlyUpkeep: 4, unlockPopulation: 5000, capacity: 2200, tags: ['road', 'bus-lane', 'tram-ready', 'cycling'], description: 'High-capacity city boulevard reserving space for public transport and cycling.' }),
  entry({ id: 'roundabout_small', name: 'Compact Roundabout', category: 'roads', buildCost: 450, monthlyUpkeep: 5, unlockPopulation: 1000, footprint: [2, 2], capacity: 1700, tags: ['junction', 'safety'], description: 'Compact roundabout for medium traffic volumes and safer intersections.' }),
  entry({ id: 'highway', name: 'Motorway', category: 'roads', buildCost: 180, monthlyUpkeep: 8, unlockPopulation: 15000, capacity: 6000, noise: 20, pollution: 12, tags: ['road', 'high-speed', 'regional'], description: 'Grade-separated regional motorway; powerful but noisy and space intensive.' }),

  // Transit
  entry({ id: 'bus_stop', name: 'Bus Stop', category: 'transit', buildCost: 120, monthlyUpkeep: 8, unlockPopulation: 300, capacity: 80, jobs: 0, tags: ['bus', 'local-transit'], description: 'Local bus stop with shelter, timetable and accessible boarding.' }),
  entry({ id: 'bus_hub', name: 'Bus Hub', category: 'transit', buildCost: 1800, monthlyUpkeep: 90, unlockPopulation: 5000, footprint: [2, 2], capacity: 900, jobs: 12, tags: ['bus', 'interchange'], description: 'Transfer hub for several bus routes with layover capacity.' }),
  entry({ id: 'tram_stop', name: 'Tram Stop', category: 'transit', buildCost: 350, monthlyUpkeep: 20, unlockPopulation: 3500, capacity: 180, tags: ['tram', 'accessible'], description: 'Street-running tram stop for dense corridors.' }),
  entry({ id: 'tram_depot', name: 'Tram Depot', category: 'transit', buildCost: 6500, monthlyUpkeep: 260, unlockPopulation: 12000, footprint: [3, 3], capacity: 30, jobs: 55, tags: ['tram', 'maintenance'], description: 'Stores and maintains the city tram fleet.' }),
  entry({ id: 'metro_station', name: 'Metro Station', category: 'transit', buildCost: 6500, monthlyUpkeep: 240, unlockPopulation: 18000, footprint: [2, 2], capacity: 1800, jobs: 20, tags: ['metro', 'rapid-transit'], description: 'High-capacity rapid-transit station for dense urban districts.' }),
  entry({ id: 'regional_station', name: 'Regional Railway Station', category: 'transit', buildCost: 12000, monthlyUpkeep: 420, unlockPopulation: 25000, footprint: [4, 3], capacity: 3500, jobs: 80, tags: ['rail', 'regional', 'interchange'], description: 'Major rail station connecting the city to its surrounding region.' }),
  entry({ id: 'park_and_ride', name: 'Park & Ride', category: 'transit', buildCost: 2600, monthlyUpkeep: 85, unlockPopulation: 8000, footprint: [3, 3], capacity: 500, jobs: 8, tags: ['parking', 'transit', 'edge-of-city'], description: 'Intercepts regional car trips at a strong public-transport connection.' }),
  entry({ id: 'ferry_terminal', name: 'Ferry Terminal', category: 'transit', buildCost: 4200, monthlyUpkeep: 180, unlockPopulation: 10000, footprint: [3, 2], capacity: 700, jobs: 30, tags: ['water', 'transit'], description: 'Passenger ferry terminal for useful cross-water connections.' }),

  // Housing
  entry({ id: 'row_houses', name: 'Row Houses', category: 'residential', buildCost: 850, monthlyUpkeep: 15, unlockPopulation: 0, footprint: [2, 1], capacity: 18, tags: ['housing', 'medium-density'], description: 'Compact family housing typical of many European neighbourhoods.' }),
  entry({ id: 'semi_detached', name: 'Semi-detached Homes', category: 'residential', buildCost: 900, monthlyUpkeep: 14, unlockPopulation: 0, footprint: [2, 1], capacity: 10, tags: ['housing', 'family'], description: 'Lower-density family homes with private gardens.' }),
  entry({ id: 'social_housing', name: 'Social Housing Block', category: 'residential', buildCost: 2600, monthlyUpkeep: 70, unlockPopulation: 3000, footprint: [2, 2], capacity: 110, tags: ['housing', 'affordable'], description: 'Affordable rental housing that eases pressure on low-income households.' }),
  entry({ id: 'midrise_apartments', name: 'Mid-rise Apartments', category: 'residential', buildCost: 3800, monthlyUpkeep: 95, unlockPopulation: 6000, footprint: [2, 2], capacity: 180, tags: ['housing', 'density', 'urban'], description: 'Efficient urban housing suited to transit corridors and centres.' }),
  entry({ id: 'mixed_use_block', name: 'Mixed-use Block', category: 'residential', buildCost: 5200, monthlyUpkeep: 140, unlockPopulation: 10000, footprint: [2, 2], capacity: 160, jobs: 65, tags: ['housing', 'commercial', 'mixed-use', 'walkable'], description: 'Apartments over shops and services, reducing travel distances.' }),
  entry({ id: 'student_housing', name: 'Student Housing', category: 'residential', buildCost: 3400, monthlyUpkeep: 90, unlockPopulation: 12000, footprint: [2, 2], capacity: 220, tags: ['housing', 'education'], description: 'Compact housing near universities and strong transit.' }),
  entry({ id: 'senior_housing', name: 'Senior Living Complex', category: 'residential', buildCost: 3900, monthlyUpkeep: 125, unlockPopulation: 9000, footprint: [2, 2], capacity: 120, jobs: 30, tags: ['housing', 'care', 'accessible'], description: 'Accessible housing with on-site care and community facilities.' }),
  entry({ id: 'houseboats', name: 'Houseboats', category: 'residential', buildCost: 1600, monthlyUpkeep: 35, unlockPopulation: 4000, capacity: 8, tags: ['housing', 'waterfront'], description: 'Small-scale waterfront housing requiring suitable quays or banks.' }),

  // Commercial
  entry({ id: 'neighbourhood_shops', name: 'Neighbourhood Shops', category: 'commercial', buildCost: 700, monthlyUpkeep: 22, unlockPopulation: 0, jobs: 14, tags: ['retail', 'local'], description: 'Daily shops and services within walking distance of homes.' }),
  entry({ id: 'supermarket', name: 'Supermarket', category: 'commercial', buildCost: 2100, monthlyUpkeep: 75, unlockPopulation: 2500, footprint: [2, 2], jobs: 45, tags: ['retail', 'daily-needs'], description: 'High-demand daily retail serving several neighbourhoods.' }),
  entry({ id: 'restaurant_strip', name: 'Restaurant & Café Block', category: 'commercial', buildCost: 1800, monthlyUpkeep: 65, unlockPopulation: 3500, footprint: [2, 1], jobs: 55, noise: 5, tags: ['hospitality', 'nightlife'], description: 'Restaurants and cafés that animate central streets and waterfronts.' }),
  entry({ id: 'hotel', name: 'City Hotel', category: 'commercial', buildCost: 4800, monthlyUpkeep: 150, unlockPopulation: 9000, footprint: [2, 2], jobs: 80, tags: ['tourism', 'hospitality'], description: 'Visitor accommodation that benefits from landmarks and transport hubs.' }),
  entry({ id: 'office_midrise', name: 'Mid-rise Offices', category: 'commercial', buildCost: 5200, monthlyUpkeep: 170, unlockPopulation: 12000, footprint: [2, 2], jobs: 220, tags: ['office', 'services'], description: 'Professional employment suited to central and transit-accessible locations.' }),
  entry({ id: 'market_hall', name: 'Market Hall', category: 'commercial', buildCost: 3500, monthlyUpkeep: 110, unlockPopulation: 7000, footprint: [2, 2], jobs: 70, tags: ['retail', 'food', 'tourism'], description: 'Indoor food and goods market that strengthens a town centre.' }),

  // Industry and logistics
  entry({ id: 'light_industry', name: 'Light Industry', category: 'industry', buildCost: 2200, monthlyUpkeep: 80, unlockPopulation: 2000, footprint: [2, 2], jobs: 75, pollution: 8, tags: ['manufacturing', 'jobs'], description: 'Smaller clean-ish manufacturing compatible with urban employment districts.' }),
  entry({ id: 'food_factory', name: 'Food Processing Plant', category: 'industry', buildCost: 4200, monthlyUpkeep: 135, unlockPopulation: 6000, footprint: [3, 2], jobs: 130, pollution: 12, tags: ['manufacturing', 'food', 'freight'], description: 'Processes regional agricultural inputs and needs reliable freight access.' }),
  entry({ id: 'high_tech_campus', name: 'High-tech Campus', category: 'industry', buildCost: 7800, monthlyUpkeep: 240, unlockPopulation: 18000, footprint: [3, 3], jobs: 260, pollution: 2, tags: ['technology', 'educated-jobs'], description: 'Research and high-value production attracted by universities and amenities.' }),
  entry({ id: 'distribution_center', name: 'Distribution Centre', category: 'industry', buildCost: 5200, monthlyUpkeep: 190, unlockPopulation: 10000, footprint: [4, 3], jobs: 150, noise: 14, pollution: 7, tags: ['logistics', 'freight'], description: 'Large logistics facility best placed near regional roads and rail freight.' }),
  entry({ id: 'recycling_industry', name: 'Recycling Works', category: 'industry', buildCost: 4800, monthlyUpkeep: 160, unlockPopulation: 8000, footprint: [3, 3], jobs: 95, pollution: 10, tags: ['recycling', 'circular-economy'], description: 'Recovers material from municipal and commercial waste streams.' }),
  entry({ id: 'data_center', name: 'Data Centre', category: 'industry', buildCost: 9000, monthlyUpkeep: 320, unlockPopulation: 22000, footprint: [3, 3], jobs: 55, noise: 6, tags: ['technology', 'power-intensive'], description: 'Digital infrastructure with high electricity demand but relatively few jobs.' }),

  // Public services
  entry({ id: 'primary_school', name: 'Primary School', category: 'services', buildCost: 1500, monthlyUpkeep: 120, unlockPopulation: 800, footprint: [2, 2], capacity: 450, jobs: 45, tags: ['education', 'children'], description: 'Neighbourhood primary school that should be safely walkable and cyclable.' }),
  entry({ id: 'secondary_school', name: 'Secondary School', category: 'services', buildCost: 3200, monthlyUpkeep: 240, unlockPopulation: 5000, footprint: [3, 3], capacity: 900, jobs: 90, tags: ['education'], description: 'Larger secondary school serving several districts.' }),
  entry({ id: 'gp_clinic', name: 'GP Clinic', category: 'services', buildCost: 1300, monthlyUpkeep: 105, unlockPopulation: 1200, footprint: [2, 1], capacity: 500, jobs: 28, tags: ['health', 'local-service'], description: 'Primary healthcare close to residents, reducing unnecessary hospital demand.' }),
  entry({ id: 'ambulance_station', name: 'Ambulance Station', category: 'services', buildCost: 1800, monthlyUpkeep: 155, unlockPopulation: 5000, footprint: [2, 2], capacity: 8, jobs: 35, tags: ['health', 'emergency'], description: 'Improves emergency medical response times.' }),
  entry({ id: 'library', name: 'Public Library', category: 'services', buildCost: 1800, monthlyUpkeep: 95, unlockPopulation: 3000, footprint: [2, 2], jobs: 22, tags: ['culture', 'education'], description: 'Accessible local culture and learning facility.' }),
  entry({ id: 'care_center', name: 'Community Care Centre', category: 'services', buildCost: 2800, monthlyUpkeep: 210, unlockPopulation: 8000, footprint: [2, 2], capacity: 140, jobs: 70, tags: ['care', 'health'], description: 'Provides community, elderly and social care services.' }),
  entry({ id: 'courthouse', name: 'Courthouse', category: 'services', buildCost: 6500, monthlyUpkeep: 260, unlockPopulation: 20000, footprint: [3, 3], jobs: 110, tags: ['government', 'justice'], description: 'Regional justice facility supporting a larger city.' }),

  // Utilities
  entry({ id: 'solar_farm', name: 'Solar Farm', category: 'utilities', buildCost: 4200, monthlyUpkeep: 75, unlockPopulation: 3500, footprint: [4, 3], capacity: 18, tags: ['power', 'renewable'], description: 'Low-emission electricity with land demand and daylight-dependent output.' }),
  entry({ id: 'wind_turbines', name: 'Wind Turbine Cluster', category: 'utilities', buildCost: 6500, monthlyUpkeep: 120, unlockPopulation: 6000, footprint: [3, 3], capacity: 30, noise: 8, tags: ['power', 'renewable'], description: 'Renewable generation suited to open or industrial areas.' }),
  entry({ id: 'battery_storage', name: 'Grid Battery', category: 'utilities', buildCost: 5200, monthlyUpkeep: 95, unlockPopulation: 12000, footprint: [2, 2], capacity: 20, tags: ['power', 'storage'], description: 'Balances peak electricity demand and intermittent renewable generation.' }),
  entry({ id: 'wastewater_plant', name: 'Wastewater Treatment Plant', category: 'utilities', buildCost: 8500, monthlyUpkeep: 330, unlockPopulation: 5000, footprint: [4, 3], capacity: 25000, jobs: 55, pollution: 6, tags: ['water', 'sewer'], description: 'Treats wastewater; downstream water quality depends on adequate capacity.' }),
  entry({ id: 'recycling_center', name: 'Recycling Centre', category: 'utilities', buildCost: 3000, monthlyUpkeep: 140, unlockPopulation: 4000, footprint: [3, 2], capacity: 14000, jobs: 35, tags: ['waste', 'recycling'], description: 'Household recycling and material recovery facility.' }),
  entry({ id: 'telecom_exchange', name: 'Telecom Exchange', category: 'utilities', buildCost: 2800, monthlyUpkeep: 85, unlockPopulation: 7500, footprint: [2, 2], capacity: 18000, jobs: 18, tags: ['telecom', 'data'], description: 'Local digital infrastructure improving service and business attractiveness.' }),
  entry({ id: 'ev_charging_hub', name: 'EV Charging Hub', category: 'utilities', buildCost: 1900, monthlyUpkeep: 55, unlockPopulation: 5500, footprint: [2, 2], capacity: 45, jobs: 5, tags: ['mobility', 'electric'], description: 'High-capacity public charging near destinations and major routes.' }),

  // Recreation and environment
  entry({ id: 'dog_park', name: 'Dog Park', category: 'recreation', buildCost: 220, monthlyUpkeep: 8, unlockPopulation: 500, footprint: [2, 1], tags: ['park', 'local'], description: 'Small fenced recreation space for dense residential neighbourhoods.' }),
  entry({ id: 'city_forest', name: 'City Forest', category: 'environment', buildCost: 1600, monthlyUpkeep: 45, unlockPopulation: 5000, footprint: [4, 4], tags: ['green', 'biodiversity', 'cooling'], description: 'Large green area improving biodiversity, cooling and recreation.' }),
  entry({ id: 'sports_complex', name: 'Community Sports Complex', category: 'recreation', buildCost: 4200, monthlyUpkeep: 180, unlockPopulation: 7000, footprint: [4, 3], jobs: 35, tags: ['sport', 'health'], description: 'Multi-sport facility serving multiple neighbourhoods.' }),
  entry({ id: 'theatre', name: 'City Theatre', category: 'recreation', buildCost: 6200, monthlyUpkeep: 250, unlockPopulation: 16000, footprint: [3, 3], jobs: 85, tags: ['culture', 'tourism'], description: 'Major cultural venue supporting the evening economy.' }),
  entry({ id: 'zoo', name: 'City Zoo', category: 'recreation', buildCost: 18000, monthlyUpkeep: 720, unlockPopulation: 35000, footprint: [6, 6], jobs: 220, tags: ['tourism', 'education', 'park'], description: 'Large regional attraction with high operating costs and visitor traffic.' }),
  entry({ id: 'urban_wetland', name: 'Urban Wetland', category: 'environment', buildCost: 1800, monthlyUpkeep: 35, unlockPopulation: 5000, footprint: [4, 3], tags: ['flood', 'biodiversity', 'water'], description: 'Stores stormwater, reduces flood risk and creates ecological habitat.' }),
  entry({ id: 'green_roof_program', name: 'Green Roof Programme', category: 'environment', buildCost: 1200, monthlyUpkeep: 30, unlockPopulation: 12000, tags: ['policy', 'cooling', 'water'], description: 'District upgrade increasing roof vegetation and stormwater retention.' }),
];

export const NEXT_BUILD_CATALOG_BY_ID = new Map(
  NEXT_GENERATION_BUILD_CATALOG.map((catalogEntry) => [catalogEntry.id, catalogEntry]),
);

export function getNextBuildCatalogByCategory(category: NextBuildCategory): NextBuildCatalogEntry[] {
  return NEXT_GENERATION_BUILD_CATALOG.filter((catalogEntry) => catalogEntry.category === category);
}
