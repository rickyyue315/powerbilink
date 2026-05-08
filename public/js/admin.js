var linkForm = document.getElementById('linkForm');
var linkFormError = document.getElementById('linkFormError');
var linkModalTitle = document.getElementById('linkModalTitle');
var linkId = document.getElementById('linkId');
var linkTitle = document.getElementById('linkTitle');
var linkUrl = document.getElementById('linkUrl');
var linkCategory = document.getElementById('linkCategory');
var linkDescription = document.getElementById('linkDescription');
var linkImage = document.getElementById('linkImage');
var uploadArea = document.getElementById('uploadArea');
var uploadPlaceholder = document.getElementById('uploadPlaceholder');
var imagePreview = document.getElementById('imagePreview');
var removeImageBtn = document.getElementById('removeImageBtn');
var confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
var deleteMsg = document.getElementById('deleteMsg');
var deleteLinkTitle = document.getElementById('deleteLinkTitle');

var editingId = null;
var deletingId = null;
var existingImageUrl = null;

uploadArea.addEventListener('click', function () { linkImage.click(); });
linkImage.addEventListener('change', handleImageSelect);
removeImageBtn.addEventListener('click', removeImage);
linkForm.addEventListener('submit', handleLinkSubmit);
confirmDeleteBtn.addEventListener('click', handleDeleteConfirm);

function openAddLink() {
  editingId = null;
  existingImageUrl = null;
  linkFormError.style.display = 'none';
  linkForm.reset();
  linkId.value = '';
  linkModalTitle.textContent = '新增 PowerBI 連結';
  resetImageUpload();
  populateCategoryDatalist();
  openModal(linkModal);
}

function openEditLink(id) {
  var link = state.links.find(function (l) { return l.id === id; });
  if (!link) return;

  editingId = id;
  existingImageUrl = link.imageUrl;
  linkFormError.style.display = 'none';
  linkModalTitle.textContent = '編輯 PowerBI 連結';

  linkId.value = link.id;
  linkTitle.value = link.title;
  linkUrl.value = link.url;
  linkCategory.value = link.category || '';
  linkDescription.value = link.description || '';

  resetImageUpload();
  if (link.imageUrl) {
    imagePreview.src = link.imageUrl;
    imagePreview.onerror = function () {
      imagePreview.style.display = 'none';
      uploadPlaceholder.style.display = 'flex';
      existingImageUrl = null;
    };
    imagePreview.style.display = 'block';
    uploadPlaceholder.style.display = 'none';
    removeImageBtn.style.display = 'inline-flex';
  }

  populateCategoryDatalist();
  openModal(linkModal);
}

function openDeleteConfirm(id) {
  var link = state.links.find(function (l) { return l.id === id; });
  if (!link) return;

  deletingId = id;
  deleteLinkTitle.textContent = link.title;
  openModal(deleteModal);
}

function resetImageUpload() {
  linkImage.value = '';
  imagePreview.src = '';
  imagePreview.style.display = 'none';
  uploadPlaceholder.style.display = 'flex';
  removeImageBtn.style.display = 'none';
}

function handleImageSelect() {
  var file = linkImage.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('圖片大小不能超過 5MB', 'error');
    linkImage.value = '';
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    imagePreview.src = e.target.result;
    imagePreview.style.display = 'block';
    uploadPlaceholder.style.display = 'none';
    removeImageBtn.style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  existingImageUrl = null;
  resetImageUpload();
  if (editingId) {
    var form = document.getElementById('linkForm');
    var marker = document.getElementById('removeImageMarker');
    if (!marker) {
      marker = document.createElement('input');
      marker.type = 'hidden';
      marker.name = 'removeImage';
      marker.value = 'true';
      marker.id = 'removeImageMarker';
      form.appendChild(marker);
    }
  }
}

function handleLinkSubmit(e) {
  e.preventDefault();
  linkFormError.style.display = 'none';

  var formData = new FormData();
  formData.append('title', linkTitle.value.trim());
  formData.append('url', linkUrl.value.trim());
  formData.append('category', linkCategory.value.trim());
  formData.append('description', linkDescription.value.trim());

  var file = linkImage.files[0];
  if (file) {
    formData.append('image', file);
  }

  var method = editingId ? 'PUT' : 'POST';
  var url = editingId ? '/api/links/' + editingId : '/api/links';

  API(url, {
    method: method,
    body: formData
  })
    .then(function (r) {
      var data = {};
      return r.text().then(function (text) {
        try { data = JSON.parse(text); } catch {}
        if (!r.ok) throw new Error(data.error || '操作失敗');
        closeModal(linkModal);
        loadLinks();
        loadCategories();
        showToast(editingId ? '連結已更新' : '連結已新增', 'success');
      });
    })
    .catch(function (err) {
      linkFormError.style.display = 'block';
      linkFormError.textContent = err.message || '網絡錯誤，請稍後再試';
    });
}

function handleDeleteConfirm() {
  if (!deletingId) return;

  API('/api/links/' + deletingId, { method: 'DELETE' })
    .then(function (r) {
      var data = {};
      return r.text().then(function (text) {
        try { data = JSON.parse(text); } catch {}
        if (!r.ok) throw new Error(data.error || '刪除失敗');
        closeModal(deleteModal);
        loadLinks();
        loadCategories();
        showToast('連結已刪除', 'success');
        deletingId = null;
      });
    })
    .catch(function (err) {
      showToast(err.message || '刪除失敗', 'error');
    });
}

function populateCategoryDatalist() {
  var datalist = document.getElementById('categoryList');
  var existing = state.links
    .map(function (l) { return l.category; })
    .filter(function (c, i, arr) { return c && arr.indexOf(c) === i; })
    .sort();
  datalist.innerHTML = '';
  existing.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c;
    datalist.appendChild(opt);
  });
}
