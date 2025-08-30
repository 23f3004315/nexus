# NexusAI: A Browser-Based LLM Agent Proof-of-Concept (POC)

![NexusAI Screenshot](https://i.imgur.com/your-screenshot-url.png) **NexusAI** is a minimal yet powerful proof-of-concept demonstrating a browser-based LLM agent that can reason and use external tools to accomplish complex tasks. This project showcases how to implement a core reasoning loop in JavaScript, enabling the agent to dynamically call tools like web search and code execution until a goal is met.

## ✨ Key Features

* **🧠 Intelligent Reasoning Loop:** The agent queries an LLM, processes the response, and decides whether to use a tool or ask the user for more information, looping until the task is complete.
* **🔧 Multi-Tool Capability:** Seamlessly integrates external tools based on the LLM's decisions.
    * 🌐 **Web Search:** Fetches real-time information snippets.
    * 💻 **Code Execution:** Securely runs JavaScript code within the browser.
    * 🔗 **AI Pipe Proxy:** Connects to flexible dataflows and multiple models through `aipipe.org`.
* **🗣️ Interactive Chat UI:** A clean, modern, and responsive interface for user-agent conversation.
* **⚙️ Customizable Settings:** An intuitive modal allows users to select their LLM provider (via AI Pipe), model, and enter API keys.

## 🚀 Getting Started

To run this project locally, follow these simple steps:

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/nexus-ai-poc.git](https://github.com/your-username/nexus-ai-poc.git)
    ```

2.  **Navigate to the directory:**
    ```bash
    cd nexus-ai-poc
    ```

3.  **Open the application:**
    Simply open the `index.html` file in any modern web browser.

4.  **Configure API Key:**
    * Click the **Settings** icon (⚙️) in the top-right corner.
    * Select your LLM Provider (e.g., AI Pipe).
    * Enter your corresponding **API Key / Token**. The model list will populate automatically.
    * Click **Save Settings**. You're now ready to chat!

## 📁 File Structure

The project is intentionally kept simple for maximum hackability:
