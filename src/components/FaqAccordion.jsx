import { useState } from "react";
import { faqItems } from "../data.js";

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="accordion">
      {faqItems.map((item, index) => {
        const isOpen = openIndex === index;

        return (
          <div className="accordion__item reveal" key={item.question}>
            <button
              className="accordion__button"
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
            >
              <span>{item.question}</span>
              <span className="accordion__plus" aria-hidden="true" />
            </button>
            <div className="accordion__content">
              <div>
                <p>{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
