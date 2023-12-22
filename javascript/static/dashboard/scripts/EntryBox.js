/**
 * This file holds the class and styling for 
 * the element that holds a key or a value.
 * The main purpose is just to have a consistent
 * design with the gink Container boxes.
 */

const entryTemplate = document.createElement('template');
entryTemplate.innerHTML = `
    <style> 
        div {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background-color: #BEBEBE;
            color: white;
            border-radius: 10px;
            height: 2rem;
            width: 6rem;
        }
    </style>
    <div>
        <slot></slot>
    </div>
`;

class EntryBox extends HTMLElement {
    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.append(entryTemplate.content.cloneNode(true));

    }
}
customElements.define('entry-box', EntryBox);