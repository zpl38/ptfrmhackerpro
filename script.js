const senhaInput = document.getElementById("senha");
const enviarForm = document.getElementById('Enviar');
const progressModal = document.getElementById('progressModal');
const closeModalBtn = document.getElementById('closeModal');
const tempoMinInput = document.getElementById('tempoMin');
const tempoMaxInput = document.getElementById('tempoMax');
const togglePassword = document.getElementById('togglePassword');

const raInput = document.getElementById('ra'); // Get the RA input field

const antiBotQuestionElement = document.getElementById('antiBotQuestion');
const antiBotAnswerInput = document.getElementById('antiBotAnswer');
let antiBotCorrectAnswer;

let trava = false;
let countdownInterval; 
let shouldStopExecution = false;
let totalTasksFound = 0;
let completedTasksCount = 0; // Novo contador para tarefas concluídas

// --- Anti-bot challenge generation ---
function generateAntiBotChallenge() {
    const num1 = Math.floor(Math.random() * 10) + 1; // Numbers between 1 and 10
    const num2 = Math.floor(Math.random() * 10) + 1;
    antiBotCorrectAnswer = num1 + num2;
    antiBotQuestionElement.textContent = `Quanto é ${num1} + ${num2}?`;
    antiBotAnswerInput.value = ''; // Clear previous answer
}

// Generate challenge on page load
document.addEventListener('DOMContentLoaded', generateAntiBotChallenge);

// --- Password toggle functionality ---
togglePassword.addEventListener('click', function () {
    const type = senhaInput.getAttribute('type') === 'password' ? 'text' : 'password';
    senhaInput.setAttribute('type', type);
    // Toggle the eye icon
    this.querySelector('i').classList.toggle('fa-eye');
    this.querySelector('i').classList.toggle('fa-eye-slash');
});

document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

document.addEventListener('selectstart', function(e) {
    e.preventDefault();
});

document.addEventListener('dragstart', function(e) {
    e.preventDefault();
});

enviarForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (trava) return;

    // Anti-bot check
    if (parseInt(antiBotAnswerInput.value) !== antiBotCorrectAnswer) {
        showNotification('Erro de segurança', 'Resposta incorreta para o desafio anti-bot. Tente novamente.', 'error');
        generateAntiBotChallenge(); // Generate a new challenge
        return;
    }

    // Append "SP" to RA if it's not already there
    let currentRa = raInput.value.trim().toUpperCase(); // Get RA and convert to uppercase
    if (!currentRa.endsWith('SP')) {
        raInput.value = currentRa + 'SP';
    }

    // Validate time inputs
    const minTime = parseInt(tempoMinInput.value);
    const maxTime = parseInt(tempoMaxInput.value);

    if (isNaN(minTime) || isNaN(maxTime) || minTime < 0 || maxTime < 0) {
        showNotification('Erro de Tempo', 'Por favor, insira tempos válidos (números positivos ou zero).', 'error');
        return;
    }
    if (minTime > maxTime) {
        showNotification('Erro de Tempo', 'O tempo mínimo não pode ser maior que o tempo máximo.', 'error');
        return;
    }

    trava = true;
    completedTasksCount = 0; // Reset completed tasks count
    try {
        await loginRequest();
    } catch (error) {
        trava = false;
        generateAntiBotChallenge(); // Generate new challenge on login failure
        console.error("Login request failed:", error); // Log the error for debugging
    }
});

closeModalBtn.addEventListener('click', () => {
    progressModal.style.display = 'none';
    shouldStopExecution = true;
    clearInterval(countdownInterval); // Clear any main countdown
    showNotification('Processo interrompido', 'A execução das tarefas foi cancelada pelo usuário.', 'info');
    generateAntiBotChallenge(); // Generate new challenge on interruption
});

async function loginRequest() {
    const loginData = {
        user: document.getElementById('ra').value,
        senha: senhaInput.value
    };

    const headers = {
        'Accept': 'application/json',
        'Ocp-Apim-Subscription-Key': '2b03c1db3884488795f79c37c069381a',
        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    };

    try {
        const data = await makeRequest(
            'https://sedintegracoes.educacao.sp.gov.br/credenciais/api/LoginCompletoToken',
            'POST',
            headers,
            loginData
        );
        await sendRequest(data.token);
    } catch (error) {
        showNotification('Erro de login', 'Não foi possível fazer login. Verifique suas credenciais.', 'error');
        throw new Error('Login failed');
    }
}

async function sendRequest(token) {
    try {
        const data = await makeRequest(
            'https://edusp-api.ip.tv/registration/edusp/token',
            'POST',
            getDefaultHeaders(),
            { token }
        );
        await fetchUserRooms(data.auth_token);
    } catch (error) {
        showNotification('Erro de registro', 'Erro ao registrar token. Tente novamente.', 'error');
        throw new Error('Registration failed');
    }
}

async function fetchUserRooms(token) {
    try {
        const data = await makeRequest(
            'https://edusp-api.ip.tv/room/user?list_all=true&with_cards=true',
            'GET',
            { ...getDefaultHeaders(), 'x-api-key': token }
        );

        if (data.rooms && data.rooms.length > 0) {
            totalTasksFound = 0;
            shouldStopExecution = false;
            
            await Promise.all(
                data.rooms.map(room => fetchTasks(token, room.name, room.topic))
            );
            
            if (totalTasksFound === 0) {
                showNotification('Nenhuma tarefa encontrada', 'Não há tarefas pendentes para serem executadas no momento.', 'info');
            }
        }
    } catch (error) {
        showNotification('Erro ao buscar salas', 'Não foi possível buscar as salas de aula.', 'error');
        throw new Error('Failed to fetch rooms');
    } finally {
        trava = false;
        generateAntiBotChallenge(); // Generate new challenge after process completes/fails
    }
}

async function fetchTasks(token, room, name) {
    const endpoints = [
        { label: 'Rascunho', url: `https://edusp-api.ip.tv/tms/task/todo?expired_only=false&filter_expired=true&with_answer=true&is_essay=false&publication_target=${room}&answer_statuses=draft&with_apply_moment=true` },
        { label: 'Expirada', url: `https://edusp-api.ip.tv/tms/task/todo?expired_only=true&filter_expired=false&with_answer=true&is_essay=false&publication_target=${room}&answer_statuses=pending&with_apply_moment=true` },
        { label: 'Normal', url: `https://edusp-api.ip.tv/tms/task/todo?expired_only=false&filter_expired=true&with_answer=true&is_essay=false&publication_target=${room}&answer_statuses=pending&with_apply_moment=false` }
    ];

    const headers = { ...getDefaultHeaders(), 'x-api-key': token };

    try {
        const results = await Promise.all(
            endpoints.map(async ({ label, url }) => {
                try {
                    const data = await makeRequest(url, 'GET', headers);
                    return { label, data };
                } catch (error) {
                    console.warn(`Failed to fetch tasks for ${label} from ${url}:`, error);
                    return null;
                }
            })
        );
        processTaskResults(results, token, room, name);
    } catch (error) {
        console.error("Failed to fetch all tasks:", error);
        throw new Error('Failed to fetch tasks');
    }
}

function getDefaultHeaders() {
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-api-realm': 'edusp',
        'x-api-platform': 'webclient',
        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        'Connection': 'keep-alive',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty'
    };
}

async function makeRequest(url, method = 'GET', headers = {}, body = null) {
    const options = {
        method,
        headers: {
            'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            'Content-Type': 'application/json',
            ...headers
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${method} ${url} => ${response.status} - ${errorText}`);
    }
    return response.json();
}

function isRedacao(task) {
    return task.tags?.some(t => t.toLowerCase().includes('redacao')) ||
           task.title.toLowerCase().includes('redação');
}

function processTaskResults(results, token, room, name) {
    results.forEach(result => {
        if (result && result.data.length > 0 && result.label !== 'Rascunho') {
            let filteredData = result.data;
            if (result.label === 'Expirada') {
                filteredData = filteredData.filter(task => !isRedacao(task));
            }
            totalTasksFound += filteredData.length;
            loadTasks(filteredData, token, room, result.label);
        }
    });
}

async function loadTasks(tasks, token, room, tipo) {
    if (!tasks || tasks.length === 0) {
        // Only show this notification if totalTasksFound was actually zero after all fetches
        if (totalTasksFound === 0) {
            showNotification('Nenhuma tarefa encontrada', 'Não há tarefas processáveis para serem executadas no momento.', 'info');
        }
        progressModal.style.display = 'none'; // Hide modal if no tasks to process
        trava = false; // Release lock if no tasks
        generateAntiBotChallenge(); // Generate new challenge
        return;
    }

    const redacaoTasks = tasks.filter(isRedacao);
    const outrasTasks = tasks.filter(task => !isRedacao(task));
    const orderedTasks = [...redacaoTasks, ...outrasTasks];
    const tasksToProcess = orderedTasks.filter(task => !isRedacao(task)); // Filter out redaction tasks for processing count

    if (tasksToProcess.length === 0) {
        showNotification('Nenhuma tarefa processável', 'Todas as tarefas encontradas são redações e serão ignoradas.', 'info');
        progressModal.style.display = 'none';
        trava = false;
        generateAntiBotChallenge();
        return;
    }

    iniciarModalGlobal(tasksToProcess.length); // Use tasksToProcess.length for modal total
    
    const taskPromises = tasksToProcess.map(async (task, index) => {
        if (shouldStopExecution) {
            return;
        }
        
        try {
            const taskDetails = await getTaskDetails(task.id, token);
            await processTask(task, taskDetails, token, room); // Removed index, total from processTask as it's not directly needed here

            // Increment completed tasks and update UI for *each* completed task
            completedTasksCount++;
            atualizarProgressoModal(completedTasksCount, tasksToProcess.length); // Update with processed tasks count

        } catch (error) {
            console.error(`Error processing task "${task.title}":`, error);
            // Don't re-throw, individual task failures shouldn't stop Promise.all
            // You might want to add a count for failed tasks if desired.
        }
    });

    await Promise.all(taskPromises);
    
    // Final check after all promises have settled
    if (!shouldStopExecution) { // Only show success if not stopped by user
        progressModal.style.display = 'none';
        clearInterval(countdownInterval); // Ensure main countdown is cleared
        showNotification('Tarefas concluídas!', `${completedTasksCount} tarefas foram feitas com sucesso.`, 'success');
    }
    // If shouldStopExecution is true, the modal would have been hidden by closeModalBtn already.
    trava = false; // Release lock after all tasks finish or are stopped
    generateAntiBotChallenge(); // Generate new challenge
}

async function getTaskDetails(taskId, token) {
    const url = `https://edusp-api.ip.tv/tms/task/${taskId}/apply?preview_mode=false`;
    const headers = { ...getDefaultHeaders(), 'x-api-key': token };
    const response = await makeRequest(url, 'GET', headers);
    return processTaskDetails(response);
}

function processTaskDetails(details) {
    const answersData = {};

    details.questions.forEach(question => {
        if (question.type === 'info') return;

        const questionId = question.id;
        let answer = {};

        if (question.type === 'media') {
            answer = { status: 'error', message: 'Type=media system require url' };
        } else if (question.options && typeof question.options === 'object') {
            const options = Object.values(question.options);
            if (options.length > 0) {
                const correctIndex = Math.floor(Math.random() * options.length);

                options.forEach((_, i) => {
                    answer[i] = i === correctIndex;
                });
            } else {
                answer = {};
            }
        } else {
            answer = {};
        }

        answersData[questionId] = {
            question_id: questionId,
            question_type: question.type,
            answer
        };
    });

    return answersData;
}

// processTask simplificado
async function processTask(task, answersData, token, room) {
    const taskTitle = task.title;
    const taskId = task.id;

    await submitAnswers(taskId, answersData, token, room, taskTitle);
}

async function submitAnswers(taskId, answersData, token, room, taskTitle) {
    const draftBody = {
        status: 'submitted',
        accessed_on: 'room',
        executed_on: room,
        answers: answersData
    };

    const minMinutes = parseInt(tempoMinInput.value);
    const maxMinutes = parseInt(tempoMaxInput.value);
    const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
    const tempoEmSegundos = randomMinutes * 60;

    // Local variables for this specific task's countdown
    let currentTaskCountdownInterval;
    let currentTaskTimeRemaining = tempoEmSegundos;

    // Update UI for the current task being processed
    // This will frequently change as multiple tasks process in parallel
    document.getElementById('currentTask').textContent = `Processando: ${taskTitle}`;

    // Start a unique countdown for this specific task
    if (tempoEmSegundos > 0) {
        console.log(`Tarefa "${taskTitle}" esperando por ${tempoEmSegundos} segundos...`);
        
        // Update timeRemaining in the modal with the *current* task's time
        // This will flicker if many tasks are running concurrently
        document.getElementById('timeRemaining').textContent = `Aguardando ${tempoEmSegundos}s...`; 
        
        currentTaskCountdownInterval = setInterval(() => {
            currentTaskTimeRemaining--;
            if (currentTaskTimeRemaining >= 0) {
                 // Only update if this task is currently displayed or relevant
                // This will still flicker. For smooth experience,
                // you'd need a list of tasks in the modal.
                document.getElementById('timeRemaining').textContent = `Aguardando ${taskTitle.substring(0, 20)}... ${currentTaskTimeRemaining}s`;
            } else {
                clearInterval(currentTaskCountdownInterval);
            }
        }, 1000);

        await delay(tempoEmSegundos * 1000); // Actual delay for this task
        clearInterval(currentTaskCountdownInterval); // Ensure interval is cleared after delay
        console.log(`Tarefa "${taskTitle}" terminou a espera.`);
    } else {
        document.getElementById('timeRemaining').textContent = 'Processando instantaneamente...';
    }


    try {
        const response = await makeRequest(
            `https://edusp-api.ip.tv/tms/task/${taskId}/answer`,
            'POST',
            { 'x-api-key': token },
            draftBody
        );

        const newTaskId = response.id;
        await fetchAndUpdateCorrectAnswers(taskId, newTaskId, token, taskTitle);
    } catch (error) {
        console.error(`Failed to submit answers for task "${taskTitle}":`, error);
        showNotification('Erro ao enviar tarefa', `Não foi possível enviar a tarefa "${taskTitle}".`, 'error');
        throw new Error('Failed to submit answers');
    }
}

async function fetchAndUpdateCorrectAnswers(taskId, answerId, token, taskTitle) {
    try {
        const url = `https://edusp-api.ip.tv/tms/task/${taskId}/answer/${answerId}?with_task=true&with_genre=true&with_questions=true&with_assessed_skills=true`;
        const respostasAnteriores = await makeRequest(url, 'GET', { 'x-api-key': token });
        await putAnswer(respostasAnteriores, taskId, answerId, token, taskTitle);
    } catch (error) {
        console.error(`Failed to fetch or update correct answers for task "${taskTitle}":`, error);
        showNotification('Erro ao corrigir tarefa', `Não foi possível obter/corrigir a tarefa "${taskTitle}".`, 'error');
        throw new Error('Failed to update answers');
    }
}

async function putAnswer(respostasAnteriores, taskId, answerId, token, taskTitle) {
    try {
        const url = `https://edusp-api.ip.tv/tms/task/${taskId}/answer/${answerId}`;
        const novasRespostasPayload = transformJson(respostasAnteriores);
        await makeRequest(url, 'PUT', { 'x-api-key': token }, novasRespostasPayload);
        // You might want to show a notification for each completed task here, but it might spam
        // showNotification('Sucesso', `Tarefa "${taskTitle}" concluída!`, 'success'); 
    } catch (error) {
        console.error(`Failed to put answer for task "${taskTitle}":`, error);
        showNotification('Erro ao finalizar tarefa', `Não foi possível finalizar a tarefa "${taskTitle}".`, 'error');
        throw new Error('Failed to put answer');
    }
}

function transformJson(jsonOriginal) {
    if (!jsonOriginal?.task?.questions) {
        console.warn("Invalid data structure for transformJson:", jsonOriginal);
        throw new Error("Invalid data structure");
    }

    const novoJson = {
        accessed_on: jsonOriginal.accessed_on,
        executed_on: jsonOriginal.executed_on,
        answers: {}
    };

    for (const questionId in jsonOriginal.answers) {
        const questionData = jsonOriginal.answers[questionId];
        const taskQuestion = jsonOriginal.task.questions.find(q => q.id === parseInt(questionId));

        if (!taskQuestion) {
            console.warn(`Question ID ${questionId} not found in task.questions`);
            continue;
        }

        try {
            const answerPayload = createAnswerPayload(taskQuestion);
            if (answerPayload) {
                novoJson.answers[questionId] = answerPayload;
            }
        } catch (error) {
            console.error(`Error creating answer payload for question ${questionId}:`, error);
            continue;
        }
    }

    return novoJson;
}

function createAnswerPayload(taskQuestion) {
    const answerPayload = {
        question_id: taskQuestion.id,
        question_type: taskQuestion.type,
        answer: null
    };

    switch (taskQuestion.type) {
        case "order-sentences":
            if (taskQuestion.options?.sentences?.length) {
                answerPayload.answer = taskQuestion.options.sentences.map(s => s.value);
            } else {
                console.warn(`No sentences found for order-sentences question ${taskQuestion.id}`);
            }
            break;
        case "fill-words":
            if (taskQuestion.options?.phrase?.length) {
                answerPayload.answer = taskQuestion.options.phrase
                    .map((item, index) => index % 2 !== 0 ? item.value : null)
                    .filter(Boolean);
            } else {
                console.warn(`No phrase found for fill-words question ${taskQuestion.id}`);
            }
            break;
        case "text_ai":
            answerPayload.answer = { "0": removeTags(taskQuestion.comment || '') };
            break;
        case "fill-letters":
            if (taskQuestion.options?.answer !== undefined) {
                answerPayload.answer = taskQuestion.options.answer;
            } else {
                console.warn(`No answer found for fill-letters question ${taskQuestion.id}`);
            }
            break;
        case "cloud":
            if (taskQuestion.options?.ids?.length) {
                answerPayload.answer = taskQuestion.options.ids;
            } else {
                console.warn(`No ids found for cloud question ${taskQuestion.id}`);
            }
            break;
        default:
            if (taskQuestion.options && typeof taskQuestion.options === 'object') {
                answerPayload.answer = Object.fromEntries(
                    Object.entries(taskQuestion.options).map(([id, opt]) => [
                        id,
                        opt?.answer !== undefined ? opt.answer : false
                    ])
                );
            } else {
                answerPayload.answer = {};
                console.warn(`Unhandled question type: ${taskQuestion.type} for question ${taskQuestion.id}. Using empty answer.`);
            }
            break;
    }

    return answerPayload;
}

function removeTags(htmlString) {
    return htmlString.replace(/<[^>]*>?/gm, '');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function iniciarModalGlobal(totalTasks) {
    document.getElementById('totalTasks').textContent = totalTasks;
    document.getElementById('taskProgress').textContent = '0';
    document.getElementById('currentTask').textContent = 'Iniciando processamento de tarefas...';
    document.getElementById('timeRemaining').textContent = 'Aguardando delays individuais...'; 
    document.getElementById('progressBar').style.width = '0%';
    progressModal.style.display = 'flex';
    clearInterval(countdownInterval); // Clear any main countdown
}

function atualizarProgressoModal(completed, total) {
    document.getElementById('taskProgress').textContent = completed;
    const percentage = (completed / total) * 100;
    document.getElementById('progressBar').style.width = `${percentage}%`;

    if (completed === total) {
        document.getElementById('currentTask').textContent = 'Todas as tarefas concluídas!';
        document.getElementById('timeRemaining').textContent = 'Processo finalizado.';
    } else {
        // Here, currentTask and timeRemaining are updated by submitAnswers for *individual* tasks.
        // We avoid overwriting them here to let the individual task's update show through.
        // However, if no task is actively delaying, it might revert to a general message.
    }
}

// These are not directly used for the main modal display in this parallel scenario.
// They would be for a single, sequential countdown.
function startCountdown(seconds) {
    // Left as-is, but not called for overall progress.
}

function updateTimeDisplay(seconds) {
    // Left as-is, but not called for overall progress.
}


function showNotification(title, message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
        <div class="notification-header">
            <div class="notification-title">${title}</div>
        </div>
        <div class="notification-message">${message}</div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}