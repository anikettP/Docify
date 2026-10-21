export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  group: 'Popular' | 'Indian languages' | 'All languages';
  direction: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', group: 'Popular', direction: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', group: 'Popular', direction: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', group: 'Popular', direction: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', group: 'Popular', direction: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', group: 'Popular', direction: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', group: 'All languages', direction: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', group: 'All languages', direction: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', group: 'All languages', direction: 'rtl' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', group: 'All languages', direction: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', group: 'All languages', direction: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', group: 'All languages', direction: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', group: 'All languages', direction: 'ltr' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', group: 'Indian languages', direction: 'ltr' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', group: 'Indian languages', direction: 'ltr' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', group: 'Indian languages', direction: 'ltr' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', group: 'Indian languages', direction: 'ltr' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', group: 'Indian languages', direction: 'ltr' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', group: 'Indian languages', direction: 'ltr' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', group: 'Indian languages', direction: 'ltr' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', group: 'Indian languages', direction: 'ltr' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', group: 'Indian languages', direction: 'rtl' },
];

export const DEFAULT_LANGUAGE_CODE = 'en';

export function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES.find(language => language.code === code)?.name || 'English';
}
