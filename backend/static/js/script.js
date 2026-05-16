'use strict';

// Global counter for form indices (starts at 2 since 2 forms are already in HTML)
let formCounter = 2;

// ---- Duplicate validation state ----
const _dupTimers  = {};
const _dupState   = {};   // formIndex -> true if DB dup confirmed
const _DUP_FIELDS = ['fullname', 'total-monk', 'type', 'home', 'position'];

function _getFormDupValues(form) {
    return {
        fullname:    (form.querySelector('[name="fullname"]')?.value   || '').trim(),
        vassa_years: (form.querySelector('[name="total-monk"]')?.value || '').trim(),
        monk_type:   (form.querySelector('[name="type"]')?.value       || '').trim(),
        residence:   (form.querySelector('[name="home"]')?.value       || '').trim(),
        position:    (form.querySelector('[name="position"]')?.value   || '').trim()
    };
}

function _dupKeyFilled(v) {
    return v.fullname && v.vassa_years && v.monk_type && v.residence && v.position;
}

function _dupKey(v) {
    return `${v.fullname}|${v.monk_type}|${v.vassa_years}|${v.residence}|${v.position}`.toLowerCase();
}

function _showDupAlert(formCard, msg) {
    const el = formCard.querySelector('.dup-alert');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    formCard.classList.add('has-duplicate');
}

function _clearDupAlert(formCard) {
    const el = formCard.querySelector('.dup-alert');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
    formCard.classList.remove('has-duplicate');
}

async function _checkDbForDup(form) {
    const formCard  = form.closest('.form-card');
    const formIndex = form.getAttribute('data-form-index');
    const v         = _getFormDupValues(form);

    if (!_dupKeyFilled(v)) {
        _dupState[formIndex] = false;
        _clearDupAlert(formCard);
        return;
    }

    const params = new URLSearchParams({
        fullname:    v.fullname,
        monk_type:   v.monk_type,
        vassa_years: v.vassa_years,
        residence:   v.residence,
        position:    v.position
    });

    try {
        const res  = await fetch(`/api/monks/check-duplicate?${params}`);
        const data = await res.json();
        if (data.exists) {
            _dupState[formIndex] = true;
            _showDupAlert(formCard, `⚠️ ព្រះសង្ឃ "${data.match.fullname}" មានរួចហើយក្នុងប្រព័ន្ធ!`);
        } else {
            _dupState[formIndex] = false;
            _clearDupAlert(formCard);
        }
    } catch (_) {
        _dupState[formIndex] = false;
    }
}

function _scheduleDupCheck(form) {
    const formIndex = form.getAttribute('data-form-index');
    clearTimeout(_dupTimers[formIndex]);
    _dupTimers[formIndex] = setTimeout(() => _checkDbForDup(form), 420);
}

// Helper function to create a form card element
function createFormCard(index) {
    const formCard = document.createElement('div');
    formCard.className = 'form-card';
    formCard.id = `form-card-${index}`;

    formCard.innerHTML = `
        <div class="form-header">
            <span class="form-number">លេខរៀង #${index}</span>
            <button type="button" class="btn-remove" onclick="removeForm(${index})" title="លុបទម្រង់">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div class="dup-alert" style="display:none;"></div>
        <form class="monk-form" data-form-index="${index}">
            <div class="form-row">
                <div class="form-group">
                    <label for="fullname-${index}">នាមត្រកូល និង នាម <span class="required">*</span></label>
                    <input type="text" id="fullname-${index}" name="fullname" placeholder="បញ្ចូលនាមព្រះសង្ឃ" required>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                     <label for="total-monk-${index}">ចំនួនវស្សា <span class="required">*</span></label>
                    <input type="number" id="total-monk-${index}" name="total-monk" min="1" placeholder="បញ្ចូលចំនួន" required>
                </div>

            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="type-${index}"> សាមណេរ / ភិក្ខុ <span class="required">*</span></label>
                    <select name="type" id="type-${index}">
                        <option value="">-- ជ្រើសរើសបួសជា --</option>
                        <option value="សាមណេរ">សាមណេរ</option>
                        <option value="ភិក្ខុ">ភិក្ខុ</option>
                    </select>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="home-${index}">ស្នាក់នៅកុដិ <span class="required">*</span></label>
                    <select name="home" id="home-${index}">
                         <option value="">-- ជ្រើសរើសកុដិ --</option>
                        <option value="កុដិលេខ១">កុដិលេខ១</option>
                        <option value="កុដិលេខ២_ជាន់ក្រោម">កុដិលេខ២​ ជាន់ក្រោម</option>
                        <option value="កុដិលេខ២_ជាន់លើ">កុដិលេខ២​ ជាន់លើ</option>
                        <option value="កុដិលេខ៤">កុដិលេខ៤</option>
                        <option value="កុដិធំ_ជាន់ទី១">កុដិធំ ជាន់ទី១</option>
                        <option value="កុដិធំ_ជាន់ទី២">កុដិធំ ជាន់ទី២</option>
                        <option value="កុដិធំ_ជាន់ទី៣">កុដិធំ ជាន់ទី៣</option>
                        <option value="កុដិហោត្រៃ">កុដិហោត្រៃ</option>
                        <option value="សាលាបាលីចាស់">កុដិសលាបាលីចាស់</option>
                        <option value="សាលាពុទ្ធិក">សាលាពុទ្ធិក</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="position-${index}">តួនាទីក្នុងវត្ត <span class="required">*</span></label>
                        <select name="position" id="position-${index}">
                            <option value="">-- ជ្រើសរើសតួនាទី --</option>
                            <option value="ព្រះសង្ឃធម្មតា">ព្រះសង្ឃធម្មតា</option>
                            <option value="មេក្រុម">មេក្រុម</option>
                            <option value="អនុមេក្រុម">អនុមេក្រុម</option>
                            <option value="ព្រះគ្រូសូត្រស្តាំ">ព្រះគ្រូសូត្រស្តាំ</option>
                            <option value="ព្រះគ្រូសូត្រឆ្វេង">ព្រះគ្រូសូត្រឆ្វេង</option>
                            <option value="ព្រះគ្រូវិន័យធរ">ព្រះគ្រូវិន័យធរ</option>
                            <option value="ព្រះគ្រូលេខា">ព្រះគ្រូលេខា</option>
                            <option value="ព្រះគ្រូប្រធានការក">ព្រះគ្រូប្រធានការក</option>
                            <option value="ព្រះគ្រូអនុប្រធានការកទី១">ព្រះគ្រូអនុប្រធានការកទី១</option>
                            <option value="ព្រះគ្រូអនុប្រធានការកទី២">ព្រះគ្រូអនុប្រធានការកទី២</option>
                            <option value="មេកុដិ">មេកុដិ</option>
                            <option value="អនុកុដិ">អនុកុដិ</option>
                        </select>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="education_level-${index}">កម្រិតសិក្សា <span class="required">*</span></label>
                    <select id="education_level-${index}" name="education_level">
                        <option value="">-- ជ្រើសរើសកម្រិតសិក្សា --</option>
                        <option value="បឋមសិក្សា">បឋមសិក្សា</option>
                        <option value="អនុវិទ្យាល័យ">អនុវិទ្យាល័យ</option>
                        <option value="វិទ្យាល័យ">វិទ្យាល័យ</option>
                        <option value="មហាវិទ្យាល័យ">មហាវិទ្យាល័យ</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="academic_level-${index}">សិក្សាថ្នាក់ <span class="required">*</span></label>
                    <select name="academic_level" id="academic_level-${index}">
                         <option value="">-- ជ្រើសរើសឆ្នាំសិក្សា --</option>
                        <option value="ឆ្នាំទី១">ឆ្នាំទី ១</option>
                        <option value="ឆ្នាំទី២">ឆ្នាំទី ២</option>
                        <option value="ឆ្នាំទី៣">ឆ្នាំទី ៣</option>
                        <option value="ឆ្នាំទី៤">ឆ្នាំទី ៤</option>
                    </select>
                </div>
            </div>

        </form>
    `;

    return formCard;
}

// Function to add 2 new forms at once
function addNewForm() {
    const container = document.getElementById('forms-container');

    // Add first form
    formCounter++;
    const formCard1 = createFormCard(formCounter);
    container.appendChild(formCard1);

    // Add second form
    formCounter++;
    const formCard2 = createFormCard(formCounter);
    container.appendChild(formCard2);

    // Scroll to the new forms
    formCard2.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Function to remove a form
function removeForm(formId) {
    const formCard = document.getElementById(`form-card-${formId}`);

    if (formCard) {
        // Check if this is the last form
        const allForms = document.querySelectorAll('.form-card');
        if (allForms.length <= 2) {
            alert('មិនអាចលុបទម្រង់ចុងក្រោយបានទេ!');
            return;
        }

        // Clean up dup state
        delete _dupState[formId];
        clearTimeout(_dupTimers[formId]);
        delete _dupTimers[formId];

        // Add removing animation
        formCard.classList.add('removing');

        // Remove after animation completes
        setTimeout(() => {
            formCard.remove();
            updateFormNumbers();
        }, 300);
    }
}

// Function to update form numbers after removal
function updateFormNumbers() {
    const allForms = document.querySelectorAll('.form-card');
    allForms.forEach((form, index) => {
        const numberSpan = form.querySelector('.form-number');
        if (numberSpan) {
            numberSpan.textContent = `លេខរៀង #${index + 1}`;
        }
        const formElement = form.querySelector('.monk-form');
        if (formElement) {
            formElement.setAttribute('data-form-index', index + 1);
        }
    });
}

// Function to submit all forms
async function submitAllForms() {
    const allForms = document.querySelectorAll('.monk-form');
    const formData = [];
    let hasErrors = false;

    allForms.forEach((form, index) => {
        const formDataEntry = {
            formNumber: index + 1,
            data: {}
        };

        // Get all form fields
        const inputs = form.querySelectorAll('input, select, textarea');
        let isValid = true;

        inputs.forEach(input => {
            const value = input.value.trim();
            const name = input.name;

            // Check required fields
            if (input.hasAttribute('required') && !value) {
                isValid = false;
                hasErrors = true;
                input.style.borderColor = '#ff4757';
            } else {
                input.style.borderColor = '';
            }

            formDataEntry.data[name] = value;
        });

        if (isValid) {
            formData.push(formDataEntry);
        }
    });

    if (hasErrors) {
        alert('សូមបំពេញព័ត៍មានដែលចាំបាច់ (*) ឱ្យបានគ្រប់ចំនួន!');
        return;
    }

    // ---- Within-batch duplicate check ----
    const seen = new Map();
    let batchDupFound = false;
    allForms.forEach((form, idx) => {
        const v = _getFormDupValues(form);
        if (_dupKeyFilled(v)) {
            const key = _dupKey(v);
            if (seen.has(key)) {
                batchDupFound = true;
                _showDupAlert(form.closest('.form-card'), `⚠️ ព័ត៍មាននេះដូចគ្នានឹងទម្រង់លេខ ${seen.get(key) + 1}! សូមពិនិត្យម្ដងទៀត។`);
                const prevCard = allForms[seen.get(key)].closest('.form-card');
                if (!prevCard.classList.contains('has-duplicate')) {
                    _showDupAlert(prevCard, `⚠️ ព័ត៍មាននេះត្រូវបានបញ្ចូលម្ដងទៀតក្នុងទម្រង់ខាងក្រោម!`);
                }
            } else {
                seen.set(key, idx);
            }
        }
    });
    if (batchDupFound) {
        return;
    }

    // ---- DB duplicate state check ----
    const dbDupExists = Object.values(_dupState).some(v => v === true);
    if (dbDupExists) {
        alert('ទម្រង់មួយចំនួនមានព្រះសង្ឃដូចគ្នានឹងប្រព័ន្ធ! សូមពិនិត្យទម្រង់ដែលមានការព្រមានពណ៌ក្រហម។');
        return;
    }

    // Send data to backend API
    const submitBtn = document.querySelector('.btn-submit');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span>កំពុងរក្សាទុក...</span>';
    submitBtn.disabled = true;

    try {
        // Submit each form data to the API
        const results = [];
        for (const entry of formData) {
            const response = await fetch('/api/monks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(entry.data)
            });

            const result = await response.json();
            results.push(result);
        }

        // Check if all submissions were successful
        const allSuccess = results.every(r => r.success);

        if (allSuccess) {
            // Clear dup state
            Object.keys(_dupState).forEach(k => { _dupState[k] = false; });
            document.querySelectorAll('.form-card').forEach(card => _clearDupAlert(card));

            // Show success message
            const successMessage = document.getElementById('success-message');
            successMessage.style.display = 'flex';

            // Hide success message after 3 seconds
            setTimeout(() => {
                successMessage.style.display = 'none';
            }, 3000);

            // Clear all forms after successful submission
            allForms.forEach(form => form.reset());
        } else {
            alert('មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យមួយចំនួន។');
        }
    } catch (error) {
        console.error('Error submitting forms:', error);
        alert('មានបញ្ហាក្នុងការតភ្ជាប់។ សូមព្យាយាមម្តងទៀត។');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Add input event listeners to remove error styling when user types
document.addEventListener('input', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        if (e.target.value.trim()) {
            e.target.style.borderColor = '';
        }
    }
});

// Event delegation for duplicate checks on all 5 key fields
document.getElementById('forms-container').addEventListener('input', function (e) {
    if (!_DUP_FIELDS.includes(e.target.name)) return;
    const form = e.target.closest('.monk-form');
    if (form) _scheduleDupCheck(form);
});
document.getElementById('forms-container').addEventListener('change', function (e) {
    if (!_DUP_FIELDS.includes(e.target.name)) return;
    const form = e.target.closest('.monk-form');
    if (form) _scheduleDupCheck(form);
});

// Function to clear all form data
function clearAllForms() {
    // Confirm with user before clearing
    if (!confirm('តើអ្នកពិតជាចង់សម្អាតទិន្នន័យទាំងអស់មែនទេ?')) {
        return;
    }

    // Get all forms
    const allForms = document.querySelectorAll('.monk-form');

    // Reset each form
    allForms.forEach(form => {
        form.reset();

        // Remove any error styling
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.style.borderColor = '';
        });
    });

    // Clear all dup alerts
    Object.keys(_dupState).forEach(k => { _dupState[k] = false; });
    document.querySelectorAll('.form-card').forEach(card => _clearDupAlert(card));

    // Hide success message if visible
    const successMessage = document.getElementById('success-message');
    successMessage.style.display = 'none';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    // Inject dup-alert div into static form cards (Form 1 & 2)
    document.querySelectorAll('.form-card').forEach(card => {
        if (!card.querySelector('.dup-alert')) {
            const div = document.createElement('div');
            div.className = 'dup-alert';
            div.style.display = 'none';
            card.querySelector('.form-header').insertAdjacentElement('afterend', div);
        }
    });
});