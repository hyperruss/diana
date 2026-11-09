export const documents = [
  {
    slug: "offer",
    title: "Публичная оферта на оказание информационно-консультационных услуг",
    shortTitle: "Публичная оферта",
    description:
      "Условия оказания и оплаты услуг, порядок прохождения программ, отказа от услуг и возврата денежных средств.",
    updatedAt: "1 августа 2026",
    pdfPath: "/legal-files/public-offer.pdf",
    docxPath: "/legal-files/public-offer.docx",
  },
  {
    slug: "privacy",
    title: "Политика конфиденциальности в отношении обработки персональных данных",
    shortTitle: "Политика конфиденциальности",
    description:
      "Порядок обработки и защиты персональных данных пользователей сайта smena-academy.ru.",
    updatedAt: "1 августа 2026",
    pdfPath: "/legal-files/privacy-policy.pdf",
    docxPath: "/legal-files/privacy-policy.docx",
  },
  {
    slug: "personal-data",
    title: "Согласие на обработку персональных данных",
    shortTitle: "Согласие на обработку ПД",
    description:
      "Перечень обрабатываемых данных, цели, допустимые действия, сроки хранения и порядок отзыва согласия.",
    updatedAt: "август 2026",
    pdfPath: "/legal-files/personal-data-consent.pdf",
    docxPath: "/legal-files/personal-data-consent.docx",
  },
  {
    slug: "marketing-consent",
    title: "Согласие на получение рекламных рассылок",
    shortTitle: "Согласие на рассылки",
    description:
      "Условия получения новостей и предложений центра по электронной почте, СМС и в мессенджерах.",
    updatedAt: "август 2026",
    pdfPath: "/legal-files/marketing-consent.pdf",
    docxPath: "/legal-files/marketing-consent.docx",
  },
];

export const getDocumentBySlug = (slug) =>
  documents.find((document) => document.slug === slug);
