/**
 * This file holds the class and styling for 
 * the element that links to a Gink container.
 * The onclick callback displays the contents
 * of the container.
 */

const containerTemplate = document.createElement('template');
containerTemplate.innerHTML = `
    <style> 
        div {
            cursor: pointer;
            transition: box-shadow .3s;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: min-content;
            background-color: gray;
            color: white;
            border-radius: 10px;
            height: 2rem;
            width: 7rem;
        }
        div:hover {
            box-shadow: 0 0 10px rgba(33,33,33,.5);
        }
    </style>
    <div>
        <slot></slot>
    </div>
`;

class ContainerBox extends HTMLElement {
    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.append(containerTemplate.content.cloneNode(true));
    }

    static createAndAppend(appendTo, object) {
        let containerInnerText = createContainerText(object);
        const containerBox = appendTo.appendChild(document.createElement('container-box'));
        containerBox.innerText = containerInnerText;

        return containerBox;
    }
}
customElements.define('container-box', ContainerBox);