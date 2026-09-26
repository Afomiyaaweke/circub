'use client'

// App-wide language option. A tiny context-based i18n: one provider, one
// hook, one dictionary per language, English as the fallback for any key a
// language hasn't translated yet. The choice persists in localStorage so the
// whole app - header, landing, modals - follows it on every visit.
//
// Scope note: this covers the app chrome (nav, landing, auth, filters,
// common labels). Long-tail copy (community posts, seeds, tips) stays in
// English until translated - t() falls back automatically.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface AppLanguage {
  code: string
  // Endonym - shown in the switcher, always rendered in its own script.
  label: string
}

export const LANGUAGES: AppLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'አማርኛ' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '中文' },
]

const STORAGE_KEY = 'circub.lang'

// ---------------------------------------------------------------------------
// Dictionary keys
// ---------------------------------------------------------------------------
const en = {
  'nav.feed': 'Feed',
  'nav.local': 'Local',
  'nav.link': 'Link',
  'nav.profile': 'Profile',
  'nav.messages': 'Messages',
  'nav.ariaMessages': 'Messages',

  'header.signIn': 'Sign in',
  'header.signUpFree': 'Sign up free',
  'header.signOut': 'Sign out',
  'header.editProfile': 'Edit profile',
  'header.myNetwork': 'My network',
  'header.contactUs': 'Contact us',
  'header.privacy': 'Privacy',
  'header.terms': 'Terms',
  'header.deactivate': 'Deactivate account',
  'header.company': 'Company',
  'header.personal': 'Personal',
  'header.language': 'Language',

  'landing.headline': 'Know before you go.',
  'landing.copy': 'Prices. Places. Products. People.',
  'landing.cta': 'Post a real price',
  'landing.signUpFree': 'Sign up free',
  'landing.signIn': 'Sign in',
  'landing.guest': 'Continue as guest',

  'filter.allCategories': 'All categories',
  'filter.allCountries': 'All countries',
  'filter.allCities': 'All cities',
  'filter.allPeople': 'All people',
  'filter.category': 'Category',
  'filter.country': 'Country',
  'filter.city': 'City',

  'reg.joinTitle': 'Join circub',
  'reg.joinSubtitle': 'Create your free account in seconds. Choose between a personal profile or a company page.',
  'reg.personal': 'Personal',
  'reg.personalSub': 'Travelers & locals',
  'reg.company': 'Company',
  'reg.companySub': 'Businesses & brands',
  'reg.fullName': 'Full name *',
  'reg.headlineLabel': 'Headline (optional)',
  'reg.location': 'Location (optional)',
  'reg.contactInfo': 'Contact information (optional)',
  'reg.phone': 'Phone',
  'reg.whatsapp': 'WhatsApp',
  'reg.bio': 'Bio (optional)',
  'reg.industry': 'Industry',
  'reg.companySize': 'Company size',
  'reg.companyName': 'Company name *',
  'reg.contactPerson': 'Contact person (optional)',
  'reg.website': 'Website (optional)',
  'reg.username': 'Username *',
  'reg.email': 'Email *',
  'reg.password': 'Password *',
  'reg.createPersonal': 'Create Personal Account',
  'reg.createCompany': 'Create Company Account',
  'reg.continueGoogle': 'Continue with Google',
  'reg.alreadyAccount': 'Already have an account?',
  'reg.signInLink': 'Sign in',

  'login.welcomeBack': 'Welcome back',
  'login.signInTo': 'Sign in to your circub account.',
  'login.signInBtn': 'Sign in',
  'login.signingIn': 'Signing in...',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.signUpFree': 'Sign up free',

  'roles.question': 'I am joining as *',
  'roles.hint': 'Pick one or combine - e.g. guide + vlogger. You can change this any time.',
  'roles.guide': 'Guide',
  'roles.vlogger': 'Vlogger',
  'roles.local': 'Local',
  'roles.volunteer': 'Volunteer',
  'roles.sales': 'Sales',
  'roles.guideBlurb': 'Show travelers around',
  'roles.vloggerBlurb': 'Share your videos',
  'roles.localBlurb': 'Share real local prices',
  'roles.volunteerBlurb': 'Help your community',
  'roles.salesBlurb': 'Sell your products to travelers',

  'common.creatingAccount': 'Creating account...',
  'common.or': 'or',
}

type DictKey = keyof typeof en

// Amharic - Ge'ez script, the app's Ethiopian roots.
const am: Partial<Record<DictKey, string>> = {
  'nav.feed': 'ዋጋዎች',
  'nav.local': 'አካባቢ',
  'nav.link': 'አገናኝ',
  'nav.profile': 'መገለጫ',
  'nav.messages': 'መልእክት',
  'header.signIn': 'ግባ',
  'header.signUpFree': 'ነጻ ተመዝገብ',
  'header.signOut': 'ውጣ',
  'header.editProfile': 'መገለጫ አርትዕ',
  'header.myNetwork': 'አውታሬ',
  'header.contactUs': 'ያግኙን',
  'header.privacy': 'ግላዊነት',
  'header.terms': 'ውሎች',
  'header.deactivate': 'መለያ አጥፋ',
  'header.company': 'ኩባንያ',
  'header.personal': 'የግል',
  'header.language': 'ቋንቋ',
  'landing.headline': 'ከመሄድዎ በፊት ይወቁ።',
  'landing.copy': 'ዋጋ። ቦታዎች። ምርቶች። ሰዎች።',
  'landing.cta': 'እውነተኛ ዋጋ ጻፍ',
  'landing.signUpFree': 'ነጻ ተመዝገብ',
  'landing.signIn': 'ግባ',
  'landing.guest': 'እንግዳ ሆነው ይቀጥሉ',
  'filter.allCategories': 'ሁሉም ምድቦች',
  'filter.allCountries': 'ሁሉም ሀገራት',
  'filter.allCities': 'ሁሉም ከተሞች',
  'filter.allPeople': 'ሁሉም ሰዎች',
  'reg.joinTitle': 'circub ይቀላቀሉ',
  'reg.joinSubtitle': 'ነጻ መለያዎን በአንድ ያህል ይፍጠሩ። የግል መገለጫ ወይም የኩባንያ ገጽ ይምረጡ።',
  'reg.personal': 'የግል',
  'reg.personalSub': 'ጎብኚዎች እና አካባቢው ሰዎች',
  'reg.company': 'ኩባንያ',
  'reg.companySub': 'ንግዶች እና ብራንዶች',
  'reg.fullName': 'ሙሉ ስም *',
  'reg.username': 'የተጠቃሚ ስም *',
  'reg.email': 'ኢሜይል *',
  'reg.password': 'የመግቢያ ቃል *',
  'login.welcomeBack': 'እንኳን ደህና መጡ',
  'login.email': 'ኢሜይል',
  'login.password': 'የመግቢያ ቃል',
  'roles.question': 'እንደ ማን እየተቀላቀሉ ነው *',
  'roles.guide': 'መምሪያ',
  'roles.local': 'አካባቢው',
  'roles.sales': 'ሻጭ',
}

// Kiswahili - the East African travel corridor.
const sw: Partial<Record<DictKey, string>> = {
  'nav.feed': 'Mkondo',
  'nav.local': 'Mtaa',
  'nav.link': 'Kiungo',
  'nav.profile': 'Wasifu',
  'nav.messages': 'Ujumbe',
  'header.signIn': 'Ingia',
  'header.signUpFree': 'Jiunge bure',
  'header.signOut': 'Toka',
  'header.editProfile': 'Hariri wasifu',
  'header.myNetwork': 'Mtandao wangu',
  'header.contactUs': 'Wasiliana nasi',
  'header.privacy': 'Faragha',
  'header.terms': 'Masharti',
  'header.deactivate': 'Futa akaunti',
  'header.company': 'Kampuni',
  'header.personal': 'Binafsi',
  'header.language': 'Lugha',
  'landing.headline': 'Jua kabla ya kuenda.',
  'landing.copy': 'Bei. Maeneo. Bidhaa. Watu.',
  'landing.cta': 'Weka bei halisi',
  'landing.signUpFree': 'Jiunge bure',
  'landing.signIn': 'Ingia',
  'landing.guest': 'Endelea kama mgeni',
  'filter.allCategories': 'Kategoria zote',
  'filter.allCountries': 'Nchi zote',
  'filter.allCities': 'Miji yote',
  'filter.allPeople': 'Watu wote',
  'reg.joinTitle': 'Jiunge na circub',
  'reg.joinSubtitle': 'Fungua akaunti yako ya bure kwa sekunde. Chagua wasifu wa binafsi au ukurasa wa kampuni.',
  'reg.personal': 'Binafsi',
  'reg.company': 'Kampuni',
  'reg.fullName': 'Jina kamili *',
  'reg.username': 'Jina la mtumiaji *',
  'reg.email': 'Barua pepe *',
  'reg.password': 'Neno la siri *',
  'login.welcomeBack': 'Karibu tena',
  'login.email': 'Barua pepe',
  'login.password': 'Neno la siri',
  'roles.question': 'Najiunga kama *',
  'roles.guide': 'Mwongozi',
  'roles.local': 'Mtaa',
  'roles.sales': 'Muuzaji',
}

// العربية
const ar: Partial<Record<DictKey, string>> = {
  'nav.feed': 'الموجز',
  'nav.local': 'محلي',
  'nav.link': 'رابط',
  'nav.profile': 'الملف',
  'nav.messages': 'الرسائل',
  'header.signIn': 'تسجيل الدخول',
  'header.signUpFree': 'إنشاء حساب مجاني',
  'header.signOut': 'تسجيل الخروج',
  'header.editProfile': 'تعديل الملف',
  'header.myNetwork': 'شبكتي',
  'header.contactUs': 'اتصل بنا',
  'header.privacy': 'الخصوصية',
  'header.terms': 'الشروط',
  'header.deactivate': 'تعطيل الحساب',
  'header.company': 'شركة',
  'header.personal': 'شخصي',
  'header.language': 'اللغة',
  'landing.headline': 'اعرف قبل أن تذهب.',
  'landing.copy': 'أسعار. أماكن. منتجات. أشخاص.',
  'landing.cta': 'انشر سعراً حقيقياً',
  'landing.signUpFree': 'إنشاء حساب مجاني',
  'landing.signIn': 'تسجيل الدخول',
  'landing.guest': 'المتابعة كزائر',
  'filter.allCategories': 'كل الفئات',
  'filter.allCountries': 'كل الدول',
  'filter.allCities': 'كل المدن',
  'filter.allPeople': 'كل الأشخاص',
  'reg.joinTitle': 'انضم إلى circub',
  'reg.joinSubtitle': 'أنشئ حسابك المجاني في ثوانٍ. اختر بين ملف شخصي أو صفحة شركة.',
  'reg.personal': 'شخصي',
  'reg.company': 'شركة',
  'reg.fullName': 'الاسم الكامل *',
  'reg.username': 'اسم المستخدم *',
  'reg.email': 'البريد الإلكتروني *',
  'reg.password': 'كلمة المرور *',
  'login.welcomeBack': 'مرحباً بعودتك',
  'login.email': 'البريد الإلكتروني',
  'login.password': 'كلمة المرور',
  'roles.question': 'أنا أنضم بصفة *',
  'roles.guide': 'مرشد',
  'roles.local': 'محلي',
  'roles.sales': 'بائع',
}

// Français
const fr: Partial<Record<DictKey, string>> = {
  'nav.feed': 'Fil',
  'nav.local': 'Local',
  'nav.link': 'Lien',
  'nav.profile': 'Profil',
  'nav.messages': 'Messages',
  'header.signIn': 'Se connecter',
  'header.signUpFree': 'Inscription gratuite',
  'header.signOut': 'Se déconnecter',
  'header.editProfile': 'Modifier le profil',
  'header.myNetwork': 'Mon réseau',
  'header.contactUs': 'Nous contacter',
  'header.privacy': 'Confidentialité',
  'header.terms': 'Conditions',
  'header.deactivate': 'Désactiver le compte',
  'header.company': 'Entreprise',
  'header.personal': 'Personnel',
  'header.language': 'Langue',
  'landing.headline': 'Sachez avant de partir.',
  'landing.copy': 'Prix. Lieux. Produits. Personnes.',
  'landing.cta': 'Publier un vrai prix',
  'landing.signUpFree': 'Inscription gratuite',
  'landing.signIn': 'Se connecter',
  'landing.guest': 'Continuer en invité',
  'filter.allCategories': 'Toutes les catégories',
  'filter.allCountries': 'Tous les pays',
  'filter.allCities': 'Toutes les villes',
  'filter.allPeople': 'Toutes les personnes',
  'reg.joinTitle': 'Rejoindre circub',
  'reg.joinSubtitle': 'Créez votre compte gratuit en quelques secondes. Choisissez entre un profil personnel ou une page entreprise.',
  'reg.personal': 'Personnel',
  'reg.company': 'Entreprise',
  'reg.fullName': 'Nom complet *',
  'reg.username': "Nom d'utilisateur *",
  'reg.email': 'E-mail *',
  'reg.password': 'Mot de passe *',
  'login.welcomeBack': 'Bon retour',
  'login.email': 'E-mail',
  'login.password': 'Mot de passe',
  'roles.question': "Je rejoins en tant que *",
  'roles.guide': 'Guide',
  'roles.local': 'Local',
  'roles.sales': 'Vendeur',
}

// 中文
const zh: Partial<Record<DictKey, string>> = {
  'nav.feed': '动态',
  'nav.local': '本地',
  'nav.link': '人脉',
  'nav.profile': '我的',
  'nav.messages': '消息',
  'header.signIn': '登录',
  'header.signUpFree': '免费注册',
  'header.signOut': '退出登录',
  'header.editProfile': '编辑资料',
  'header.myNetwork': '我的人脉',
  'header.contactUs': '联系我们',
  'header.privacy': '隐私',
  'header.terms': '条款',
  'header.deactivate': '停用账号',
  'header.company': '企业',
  'header.personal': '个人',
  'header.language': '语言',
  'landing.headline': '行前先知。',
  'landing.copy': '价格。地点。产品。人脉。',
  'landing.cta': '发布真实价格',
  'landing.signUpFree': '免费注册',
  'landing.signIn': '登录',
  'landing.guest': '以游客身份继续',
  'filter.allCategories': '所有分类',
  'filter.allCountries': '所有国家',
  'filter.allCities': '所有城市',
  'filter.allPeople': '所有人',
  'reg.joinTitle': '加入 circub',
  'reg.joinSubtitle': '几秒钟创建免费账号。可选择个人资料或企业主页。',
  'reg.personal': '个人',
  'reg.company': '企业',
  'reg.fullName': '全名 *',
  'reg.username': '用户名 *',
  'reg.email': '邮箱 *',
  'reg.password': '密码 *',
  'login.welcomeBack': '欢迎回来',
  'login.email': '邮箱',
  'login.password': '密码',
  'roles.question': '我以什么身份加入 *',
  'roles.guide': '向导',
  'roles.local': '本地人',
  'roles.sales': '卖家',
}

const DICTS: Record<string, Partial<Record<DictKey, string>>> = { en, am, sw, ar, fr, zh }

// ---------------------------------------------------------------------------
// Context + provider
// ---------------------------------------------------------------------------
interface LanguageContextValue {
  lang: string
  setLang: (code: string) => void
  t: (key: DictKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => en[key],
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Hydration-safe: first paint renders English, then the stored choice is
  // applied in an effect (no SSR/localStorage mismatch).
  const [lang, setLangState] = useState('en')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && DICTS[stored]) setLangState(stored)
    } catch {}
  }, [])

  const setLang = (code: string) => {
    if (!DICTS[code]) return
    setLangState(code)
    try { localStorage.setItem(STORAGE_KEY, code) } catch {}
  }

  const t = (key: DictKey): string => DICTS[lang]?.[key] || en[key] || (key as string)

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext)
}
