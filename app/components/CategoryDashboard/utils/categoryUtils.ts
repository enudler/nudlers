import { useEffect, useState } from 'react';
import { SvgIconComponent } from '@mui/icons-material';
import { logger } from '../../../utils/client-logger';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import FastfoodIcon from '@mui/icons-material/Fastfood';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import CommuteIcon from '@mui/icons-material/Commute';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ApartmentIcon from '@mui/icons-material/Apartment';
import Phone from '@mui/icons-material/Phone';
import TransferWithinAStation from '@mui/icons-material/TransferWithinAStation';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PaymentsIcon from '@mui/icons-material/Payments';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import LocalGroceryStoreIcon from '@mui/icons-material/LocalGroceryStore';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import HomeIcon from '@mui/icons-material/Home';
import SchoolIcon from '@mui/icons-material/School';
import FlightIcon from '@mui/icons-material/Flight';
import HotelIcon from '@mui/icons-material/Hotel';
import MovieIcon from '@mui/icons-material/Movie';
import ReceiptIcon from '@mui/icons-material/Receipt';
import LaptopIcon from '@mui/icons-material/Laptop';
import LocalMallIcon from '@mui/icons-material/LocalMall';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import PetsIcon from '@mui/icons-material/Pets';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import BuildIcon from '@mui/icons-material/Build';
import LocalLaundryServiceIcon from '@mui/icons-material/LocalLaundryService';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';

// Default mappings in case we need a fallback
const defaultIconMap: { [key: string]: SvgIconComponent } = {
  'כושר': FitnessCenterIcon,
  'אוכל': FastfoodIcon,
  'ביגוד': ShoppingBagIcon,
  'פנאי': SportsSoccerIcon,
  'תחבורה': CommuteIcon,
  'בריאות': LocalHospitalIcon,
  'פנסיה': AccountBalanceIcon,
  'מסעדות': RestaurantIcon,
  'קניות': ShoppingCartIcon,
  'דירה': ApartmentIcon,
  'תקשורת': Phone,
  'העברות': TransferWithinAStation,
};

const defaultColorMap: { [key: string]: string } = {
  'כושר': '#FF6B6B',
  'אוכל': '#4ECDC4',
  'ביגוד': '#45B7D1',
  'פנאי': '#96CEB4',
  'תחבורה': '#FFEEAD',
  'בריאות': '#FF9999',
  'פנסיה': '#88D8B0',
  'מסעדות': '#FFB6B6',
  'קניות': '#A6D1E6',
  'דירה': '#FFDAB9',
  'תקשורת': '#B5EAD7',
  'העברות': '#C7CEEA'
};

// Extended icon mapping with semantic categories for better matching
const extendedIconMap: { [key: string]: { icon: SvgIconComponent, keywords: string[] } } = {
  fitness: {
    icon: FitnessCenterIcon,
    keywords: ['כושר', 'חדר כושר', 'אימון', 'ספורט', 'התעמלות']
  },
  food: {
    icon: FastfoodIcon,
    keywords: ['אוכל', 'מזון', 'ארוחות', 'משלוח', 'פוד']
  },
  clothing: {
    icon: ShoppingBagIcon,
    keywords: ['ביגוד', 'אופנה', 'בגדים', 'לבוש']
  },
  leisure: {
    icon: SportsSoccerIcon,
    keywords: ['פנאי', 'תחביב', 'בידור', 'בילוי', 'נופש']
  },
  transportation: {
    icon: CommuteIcon,
    keywords: ['תחבורה', 'נסיעה', 'נסיעות', 'הסעות', 'תחבורה ציבורית']
  },
  health: {
    icon: LocalHospitalIcon,
    keywords: ['בריאות', 'רפואה', 'רופא', 'בית חולים', 'קופת חולים']
  },
  banking: {
    icon: AccountBalanceIcon,
    keywords: ['פנסיה', 'בנק', 'השקעות', 'חיסכון', 'פיננסים']
  },
  restaurants: {
    icon: RestaurantIcon,
    keywords: ['מסעדות', 'מסעדה', 'אוכל בחוץ', 'בית קפה', 'דיינינג']
  },
  shopping: {
    icon: ShoppingCartIcon,
    keywords: ['קניות', 'רכישה', 'קנייה', 'צרכנות', 'שופינג']
  },
  housing: {
    icon: ApartmentIcon,
    keywords: ['דירה', 'מגורים', 'בית', 'נכס', 'שכירות', 'דיור']
  },
  communication: {
    icon: Phone,
    keywords: ['תקשורת', 'טלפון', 'סלולרי', 'נייד', 'מובייל']
  },
  transfers: {
    icon: TransferWithinAStation,
    keywords: ['העברות', 'העברה', 'עסקה', 'תשלום', 'עסקאות']
  },
  money: {
    icon: AttachMoneyIcon,
    keywords: ['כסף', 'מזומן', 'מטבע', 'תשלום', 'פיננסי']
  },
  groceries: {
    icon: LocalGroceryStoreIcon,
    keywords: ['מכולת', 'סופרמרקט', 'קניות מזון', 'מצרכים']
  },
  car: {
    icon: DirectionsCarIcon,
    keywords: ['רכב', 'אוטו', 'מכונית', 'נהיגה', 'רכבים']
  },
  home: {
    icon: HomeIcon,
    keywords: ['בית', 'דירה', 'מגורים', 'משק בית', 'מעון']
  },
  education: {
    icon: SchoolIcon,
    keywords: ['חינוך', 'בית ספר', 'לימודים', 'השכלה', 'תואר', 'אוניברסיטה']
  },
  travel: {
    icon: FlightIcon,
    keywords: ['נסיעה', 'טיסה', 'טיול', 'חופשה', 'מסע', 'נופש']
  },
  lodging: {
    icon: HotelIcon,
    keywords: ['מלון', 'לינה', 'אירוח', 'שהות', 'הזמנה', 'אכסניה']
  },
  entertainment: {
    icon: MovieIcon,
    keywords: ['בידור', 'סרט', 'קולנוע', 'תיאטרון', 'מופע', 'הצגה']
  },
  bills: {
    icon: ReceiptIcon,
    keywords: ['חשבונות', 'חשבון', 'קבלה', 'תשלום', 'תשלומים', 'חשבוניות']
  },
  technology: {
    icon: LaptopIcon,
    keywords: ['טכנולוגיה', 'אלקטרוניקה', 'מחשב', 'מכשיר', 'גאדג׳ט']
  },
  retail: {
    icon: LocalMallIcon,
    keywords: ['קניון', 'חנות', 'מרכז קניות', 'אאוטלט', 'חנויות']
  },
  gaming: {
    icon: SportsEsportsIcon,
    keywords: ['משחקים', 'גיימינג', 'משחקי וידאו', 'קונסולה', 'לשחק']
  },
  children: {
    icon: ChildCareIcon,
    keywords: ['ילדים', 'תינוק', 'משפחה', 'טיפול בילדים', 'גן ילדים']
  },
  pets: {
    icon: PetsIcon,
    keywords: ['חיות מחמד', 'חיות', 'וטרינר', 'כלב', 'חתול', 'טיפול בחיות']
  },
  pharmacy: {
    icon: LocalPharmacyIcon,
    keywords: ['בית מרקחת', 'תרופות', 'רפואה', 'מרשם', 'תרופה']
  },
  drinks: {
    icon: LocalBarIcon,
    keywords: ['משקאות', 'בר', 'אלכוהול', 'שתייה', 'חיי לילה']
  },
  tools: {
    icon: BuildIcon,
    keywords: ['כלים', 'תיקון', 'תחזוקה', 'חומרה', 'עשה זאת בעצמך']
  },
  services: {
    icon: LocalLaundryServiceIcon,
    keywords: ['שירותים', 'כביסה', 'ניקיון', 'תחזוקה', 'סיוע', 'עזרה']
  },
  gifts: {
    icon: CardGiftcardIcon,
    keywords: ['מתנות', 'מתנה', 'חגיגה', 'תרומה', 'צדקה']
  },
  payments: {
    icon: PaymentsIcon,
    keywords: ['תשלומים', 'עסקה', 'לשלם', 'רכישה', 'תשלום']
  }
};

// Function to find the best matching icon for a category name
export const findBestMatchingIcon = (categoryName: string): SvgIconComponent => {
  if (defaultIconMap[categoryName]) {
    return defaultIconMap[categoryName];
  }

  // Try to find the best match by comparing the category name with keywords
  const lowerCategoryName = categoryName.toLowerCase();
  let bestMatch: { icon: SvgIconComponent, score: number } = {
    icon: MonetizationOnIcon,
    score: 0
  };

  // Go through all categories in extendedIconMap
  Object.entries(extendedIconMap).forEach(([, categoryData]) => {
    const { icon, keywords } = categoryData;

    // Calculate score based on keyword matches
    const score = keywords.reduce((acc, keyword) => {
      // Check if category name includes the keyword
      if (lowerCategoryName.includes(keyword.toLowerCase())) {
        // Higher score for more exact matches (e.g., if keyword length is closer to category name length)
        return acc + (keyword.length / lowerCategoryName.length);
      }

      // Check for partial matches (e.g., "trans" matches "transfer")
      if (keyword.toLowerCase().includes(lowerCategoryName) ||
        lowerCategoryName.includes(keyword.toLowerCase().substring(0, 3))) {
        return acc + 0.5;
      }

      return acc;
    }, 0);

    // Update best match if current score is higher
    if (score > bestMatch.score) {
      bestMatch = { icon, score };
    }
  });

  // Return best match or default to MonetizationOnIcon if no good matches
  return bestMatch.score > 0 ? bestMatch.icon : MonetizationOnIcon;
};

// Function to fetch categories from the API
export const fetchCategories = async (): Promise<string[]> => {
  try {
    const response = await fetch('/api/categories');
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const errorMessage = `Failed to fetch categories: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
    return await response.json();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Error fetching categories', undefined, { errorMessage });
    // Return default categories as fallback
    return Object.keys(defaultIconMap);
  }
};

// Hook to get category icons
export const useCategoryIcons = (): { [key: string]: SvgIconComponent } => {
  const [categoryIcons, setCategoryIcons] = useState<{ [key: string]: SvgIconComponent }>(defaultIconMap);

  useEffect(() => {
    const loadCategories = async () => {
      const categories = await fetchCategories();

      // Create a new map with fetched categories
      const newIconMap: { [key: string]: SvgIconComponent } = {};

      // Assign icons to each category
      categories.forEach(category => {
        // Use the findBestMatchingIcon function for dynamic icon assignment
        newIconMap[category] = defaultIconMap[category] || findBestMatchingIcon(category);
      });

      setCategoryIcons(newIconMap);
    };

    loadCategories();
  }, []);

  return categoryIcons;
};

// Function to generate a color based on a string (category name)
export const generateColorFromString = (str: string): string => {
  // Generate a hash from the string
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Convert the hash to a color with good saturation and lightness
  // Using HSL to ensure vibrant but not too bright/dark colors
  const h = Math.abs(hash) % 360;  // Hue: 0-359 degrees on the color wheel
  const s = 65 + (hash % 20);      // Saturation: 65-85%
  const l = 55 + (hash % 10);      // Lightness: 55-65%

  return `hsl(${h}, ${s}%, ${l}%)`;
};

// Hook to get category colors
export const useCategoryColors = (): { [key: string]: string } => {
  const [categoryColors, setCategoryColors] = useState<{ [key: string]: string }>(defaultColorMap);

  useEffect(() => {
    const loadCategories = async () => {
      const categories = await fetchCategories();

      // Create a new map with fetched categories
      const newColorMap: { [key: string]: string } = {};

      // Assign colors to each category
      categories.forEach(category => {
        // Use the default color if available, otherwise generate a color based on category name
        newColorMap[category] = defaultColorMap[category] || generateColorFromString(category);
      });

      setCategoryColors(newColorMap);
    };

    loadCategories();
  }, []);

  return categoryColors;
};

// Function to get category icon (non-hook version)
export const getCategoryIcon = (category: string): SvgIconComponent => {
  return defaultIconMap[category] || findBestMatchingIcon(category);
};

// Function to get category color (non-hook version)
export const getCategoryColor = (category: string): string => {
  return defaultColorMap[category] || generateColorFromString(category);
}; 